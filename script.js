// --- MULTIPLAYER GAME LOGIC ---

// 1. Initial State and Constants
const CHOICES = {
    'rock': 'Rock',
    'paper': 'Paper',
    'scissors': 'Scissors'
};
const choiceKeys = Object.keys(CHOICES);

// Game State Variables
let gameRoomId = null;
let playerNumber = null; // 1 or 2
let roomRef = null; // Firestore document reference

// 2. DOM Elements (Wait for the document to fully load before referencing them)
document.addEventListener('DOMContentLoaded', () => {
    // 2.1 UI Elements
    const connectionPanelEl = document.getElementById('connection-panel');
    const roomIdInputEl = document.getElementById('room-id-input');
    const joinBtnEl = document.getElementById('join-btn');
    const gameStatusEl = document.getElementById('game-status');
    const roomDisplayEl = document.getElementById('room-display');
    const playerRoleEl = document.getElementById('player-role');
    const matchStatusEl = document.getElementById('match-status');
    const gameAreaEl = document.getElementById('game-area');
    const actionButtonsEl = document.getElementById('action-buttons');
    const playerChoiceTextEl = document.getElementById('player-choice-text');
    const computerChoiceTextEl = document.getElementById('computer-choice-text');
    const resultMessageEl = document.getElementById('result-message');
    const buttons = document.querySelectorAll('.buttons button');
    
    // 2.2 Event Listeners
    joinBtnEl.addEventListener('click', joinGame);
    buttons.forEach(button => {
        button.addEventListener('click', submitMove);
    });

    // 3. Core Multiplayer Functions

    /**
     * Attempts to join or create a game room.
     */
    async function joinGame() {
        if (typeof window.auth === 'undefined' || !window.auth.currentUser) {
            matchStatusEl.textContent = "Authentication pending. Please wait.";
            return;
        }

        const inputId = roomIdInputEl.value.trim();
        if (!inputId) {
            alertMessage("Please enter a Room ID.");
            return;
        }

        gameRoomId = inputId;
        const currentUserId = window.auth.currentUser.uid;
        
        // Define Firestore path: /artifacts/{appId}/public/data/rps_rooms/{roomId}
        const collectionPath = `artifacts/${window.appId}/public/data/rps_rooms`;
        roomRef = window.doc(window.db, collectionPath, gameRoomId);
        
        joinBtnEl.disabled = true;
        joinBtnEl.textContent = 'Checking...';

        // Set up the listener first
        window.onSnapshot(roomRef, (docSnap) => {
            if (docSnap.exists()) {
                handleRoomUpdate(docSnap.data(), currentUserId);
            } else {
                // If it doesn't exist, create it (Player 1)
                createRoom(currentUserId);
            }
        }, (error) => {
            console.error("Firestore listen error:", error);
            alertMessage("Error listening to room. Check console.");
            joinBtnEl.disabled = false;
            joinBtnEl.textContent = 'Join / Create Game';
        });
    }

    /**
     * Creates a new room and sets the current user as Player 1.
     * @param {string} userId The current user's Firebase UID.
     */
    async function createRoom(userId) {
        playerNumber = 1;
        const initialData = {
            status: 'waiting', // waiting, active, finished
            player1Id: userId,
            player1Move: null,
            player2Id: null,
            player2Move: null,
            updatedAt: Date.now()
        };
        try {
            await window.setDoc(roomRef, initialData);
            console.log("Room created as Player 1.");
            updateConnectionUI();
        } catch (e) {
            console.error("Error creating room:", e);
            alertMessage("Failed to create room.");
        }
    }

    /**
     * Handles state changes from the Firestore snapshot.
     * @param {object} data The current room data from Firestore.
     * @param {string} currentUserId The ID of the currently logged-in user.
     */
    async function handleRoomUpdate(data, currentUserId) {
        // Determine player number if not set (i.e., this player is joining)
        if (!playerNumber) {
            if (data.player1Id === currentUserId) {
                playerNumber = 1;
            } else if (!data.player2Id) {
                // If player 2 slot is empty, claim it
                playerNumber = 2;
                await window.setDoc(roomRef, {
                    player2Id: currentUserId,
                    status: 'active',
                    updatedAt: Date.now()
                }, { merge: true });
            } else if (data.player2Id === currentUserId) {
                playerNumber = 2;
            } else {
                alertMessage("Room is full! Try a different ID.");
                return;
            }
            updateConnectionUI();
        }

        // --- Game Flow Logic ---
        
        roomDisplayEl.textContent = gameRoomId;

        const isPlayer1 = playerNumber === 1;
        const myMove = isPlayer1 ? data.player1Move : data.player2Move;
        const opponentMove = isPlayer1 ? data.player2Move : data.player1Move;
        
        playerChoiceTextEl.textContent = myMove ? CHOICES[myMove] : "?";
        computerChoiceTextEl.textContent = opponentMove ? CHOICES[opponentMove] : "?";
        
        let statusText = "";
        let buttonsDisabled = false;

        if (data.status === 'waiting') {
            statusText = "Waiting for an opponent...";
            buttonsDisabled = true;
        } else if (data.status === 'active') {
            const opponentId = isPlayer1 ? data.player2Id : data.player1Id;

            if (!opponentId) {
                 // Should not happen if status is 'active', but safety check
                 statusText = "Waiting for opponent to connect...";
                 buttonsDisabled = true;
            } else if (myMove && opponentMove) {
                // Both moves are in, resolve the round!
                resolveRound(myMove, opponentMove);
                statusText = "Round finished! Click to play again.";
                buttonsDisabled = false;
                // Immediately reset moves in DB to prepare for next round
                resetMoves(); 
            } else if (myMove && !opponentMove) {
                statusText = "Move submitted! Waiting for opponent...";
                buttonsDisabled = true;
            } else if (!myMove && opponentMove) {
                statusText = "Opponent moved! Make your choice.";
                buttonsDisabled = false;
            } else { // Both are null
                statusText = "Make your choice for the next round.";
                buttonsDisabled = false;
            }
        }
        
        matchStatusEl.textContent = statusText;
        buttons.forEach(btn => btn.disabled = buttonsDisabled);
    }

    /**
     * Updates the local UI after a successful connection.
     */
    function updateConnectionUI() {
        connectionPanelEl.classList.add('hidden');
        gameStatusEl.classList.remove('hidden');
        gameAreaEl.classList.remove('hidden');
        actionButtonsEl.classList.remove('hidden');
        resultMessageEl.classList.remove('hidden');

        playerRoleEl.textContent = `Player ${playerNumber}`;
        joinBtnEl.disabled = true;
        joinBtnEl.textContent = 'Joined';
        
        alertMessage(`Successfully joined Room ${gameRoomId} as Player ${playerNumber}.`);
    }

    /**
     * Submits the player's move to the database.
     * @param {Event} event The click event object.
     */
    async function submitMove(event) {
        const playerChoiceKey = event.currentTarget.dataset.choice;
        
        const moveField = playerNumber === 1 ? 'player1Move' : 'player2Move';

        try {
            await window.setDoc(roomRef, {
                [moveField]: playerChoiceKey,
                updatedAt: Date.now()
            }, { merge: true });
            
            buttons.forEach(btn => btn.disabled = true);
            matchStatusEl.textContent = "Move submitted! Waiting for opponent...";

        } catch (e) {
            console.error("Error submitting move:", e);
            alertMessage("Failed to submit move.");
        }
    }

    /**
     * Resolves the winner for the current round and updates the result message.
     * This logic is based on the user's latest 'script.js' logic.
     * @param {string} playerChoiceKey The current player's choice key.
     * @param {string} opponentChoiceKey The opponent's choice key.
     */
    function resolveRound(playerChoiceKey, opponentChoiceKey) {
        if (playerChoiceKey === opponentChoiceKey) {
            resultMessageEl.textContent = "It's a tie!";
        } else if ((playerChoiceKey === 'rock' && opponentChoiceKey === 'scissors') ||
                   (playerChoiceKey === 'paper' && opponentChoiceKey === 'rock') ||
                   (playerChoiceKey === 'scissors' && opponentChoiceKey === 'paper')) {
            resultMessageEl.textContent = "You win the round!";
        } else {
            resultMessageEl.textContent = "You lose the round!";
        }
    }

    /**
     * Resets the moves in the database for the next round.
     */
    async function resetMoves() {
        // Only Player 1 should handle the heavy lifting (database writes) to prevent conflicts
        if (playerNumber === 1) {
             try {
                await window.setDoc(roomRef, {
                    player1Move: null,
                    player2Move: null,
                    updatedAt: Date.now()
                }, { merge: true });
            } catch (e) {
                console.error("Error resetting moves:", e);
            }
        }
    }
    
    /**
     * Simple alert message display (no alert() allowed).
     */
    function alertMessage(message) {
        resultMessageEl.textContent = message;
        resultMessageEl.style.backgroundColor = '#ffcdd2'; // Light red for alerts
        setTimeout(() => {
            resultMessageEl.style.backgroundColor = '#e0f7fa';
        }, 3000);
    }
});
