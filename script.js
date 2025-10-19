// --- MULTIPLAYER GAME LOGIC ---

// 1. Initial State and Constants
// Game State Variables
let gameRoomId = null;
let playerNumber = null; // 1 or 2
let roomRef = null; // Firestore document reference

// 2. DOM Elements (References will be set inside DOMContentLoaded)
let DOM = {};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener("DOMContentLoaded", () => {
    // 2.1 UI Element Initialization (Moved to a single DOM object for clean access)
    DOM.connectionPanelEl = document.getElementById("connection-panel");
    DOM.roomIdInputEl = document.getElementById("room-id-input");
    DOM.joinBtnEl = document.getElementById("join-btn");
    DOM.gameStatusEl = document.getElementById("game-status");
    DOM.roomDisplayEl = document.getElementById("room-display");
    DOM.playerRoleEl = document.getElementById("player-role");
    DOM.matchStatusEl = document.getElementById("match-status");
    DOM.gameAreaEl = document.getElementById("game-area");
    DOM.actionButtonsEl = document.getElementById("action-buttons");
    DOM.playerChoiceTextEl = document.getElementById("player-choice-text");
    DOM.opponentChoiceTextEl = document.getElementById("computer-choice-text");
    DOM.resultMessageEl = document.getElementById("result-message");
    DOM.buttons = document.querySelectorAll(".buttons button");

    // 2.2 Event Listeners
    DOM.joinBtnEl.addEventListener("click", joinGame);
    DOM.buttons.forEach((button) => {
        button.addEventListener("click", submitMove);
    });

    // 3. Core Multiplayer Functions (Now defined within DOMContentLoaded)

    /** Sets the main status message and enables/disables game buttons. */
    function setGameStatus(message, enableButtons = false) {
        DOM.matchStatusEl.textContent = message;
        DOM.buttons.forEach((btn) => (btn.disabled = !enableButtons));
    }

    /** Updates the local UI after a successful connection/join. */
    function updateConnectionUI() {
        console.log("Updating connection UI for Player", playerNumber);

        DOM.playerRoleEl.textContent = `Player ${playerNumber}`;
        DOM.joinBtnEl.disabled = true;
        DOM.joinBtnEl.textContent = "Joined";

        alertMessage(
            `Successfully joined Room ${gameRoomId} as Player ${playerNumber}.`
        );
        DOM.buttons.forEach((btn) => (btn.disabled = false));
    }
    
    /** Simple alert message display (no alert() allowed). */
    function alertMessage(message) {
        DOM.resultMessageEl.textContent = message;
        // Sets a temporary background color to highlight the message
        DOM.resultMessageEl.style.backgroundColor = "#e0f7fa"; 
        
        setTimeout(() => {
            DOM.resultMessageEl.style.backgroundColor = "";
        }, 3000);
    }

    // --- Initialization & Role Assignment ---

    /** Creates a new room and sets the current user as Player 1. */
    async function createRoom(userId) {
        playerNumber = 1;
        const initialData = {
            status: "waiting",
            player1Id: userId,
            player1Move: null,
            player2Id: null,
            player2Move: null,
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

    /** Claims Player 2 role, or re-establishes identity on refresh. */
    async function assignPlayerRole(data, curUserId) {
        if (data.player1Id === curUserId) {
            playerNumber = 1;
        
        // incase player 2 leaves and rejoins, need to reset local variables
        } else if (data.player2Id === curUserId) {
            playerNumber = 2;
        } else if (!data.player2Id) {
            // Claim Player 2 slot
            playerNumber = 2;
            await window.setDoc(
                roomRef,
                {
                    player2Id: curUserId,
                    status: "active",
                },
                { merge: true }
            );
        } else {
            // Room is full, and you're not one of the players
            alertMessage("Room is full! Try a different ID.");
            return;
        }

        updateConnectionUI();
    }

    /** Attempts to join or create a game room. */
    async function joinGame() {
        if (typeof window.auth === "undefined" || !window.auth.currentUser) {
            setGameStatus("Authentication pending. Please wait.");
            return;
        }
        const currentUserId = window.auth.currentUser.uid;

        gameRoomId = DOM.roomIdInputEl.value.trim();
        if (!gameRoomId) {
            alertMessage("Please enter a Room ID.");
            return;
        }

        // Setup Firestore reference
        const collectionPath = `artifacts/${window.appId}/public/data/rps_rooms`;
        roomRef = window.doc(window.db, collectionPath, gameRoomId);

        DOM.joinBtnEl.disabled = true;
        DOM.joinBtnEl.textContent = "Checking...";

        // Set up the listener first
        window.onSnapshot(
            roomRef,
            (docSnap) => {
                if (docSnap.exists()) {
                    handleRoomUpdate(docSnap.data(), currentUserId);
                } else {
                    createRoom(currentUserId);
                }
            },
            (error) => {
                console.error("Firestore listen error:", error);
                alertMessage("Error listening to room. Check console.");
            }
        );
    }
    
    // --- Game Logic ---

    /** Resolves the winner for the current round and updates the result message. */
    function resolveRound(playerChoiceKey, opponentChoiceKey) {
        if (playerChoiceKey === opponentChoiceKey) {
            DOM.resultMessageEl.textContent = "It's a tie!";
            DOM.resultMessageEl.style.backgroundColor = "#fff3cd"; // Light yellow for tie
        } else if (
            (playerChoiceKey === "rock" && opponentChoiceKey === "scissors") ||
            (playerChoiceKey === "paper" && opponentChoiceKey === "rock") ||
            (playerChoiceKey === "scissors" && opponentChoiceKey === "paper")
        ) {
            DOM.resultMessageEl.textContent = "You win the round!";
            DOM.resultMessageEl.style.backgroundColor = "#d4edda"; // Light green for win
        } else {
            DOM.resultMessageEl.textContent = "You lose the round!";
            DOM.resultMessageEl.style.backgroundColor = "#f8d7da"; // Light red for loss
        }
    }

    /** Resets the moves in the database for the next round. */
    async function resetMoves() {
        // Only Player 1 should handle the heavy lifting (database writes) to prevent conflicts
        if (playerNumber === 1) {
            try {
                await window.setDoc(roomRef, {
                    player1Move: null,
                    player2Move: null
                }, { merge: true });
            } catch (e) {
                console.error("Error resetting moves:", e);
            }
        }
    }

    /** Submits the player's move to the database. */
    async function submitMove(event) {
        const playerChoiceKey = event.currentTarget.dataset.choice;
        const moveField = playerNumber === 1 ? "player1Move" : "player2Move";

        try {
            await window.setDoc(
                roomRef,
                { [moveField]: playerChoiceKey },
                { merge: true }
            );
        } catch (e) {
            console.error("Error submitting move:", e);
            alertMessage("Failed to submit move.");
        }
    }

    /** Dispatches UI updates based on the current game state. */
    function dispatchGameState(data, myMove, opponentMove) {
        DOM.roomDisplayEl.textContent = gameRoomId;

        if (data.status === "waiting") {
            console.log('waiting moment')
            setGameStatus("Waiting for an opponent...", false);
            return;
        } 
        
        if (myMove && opponentMove) {
            resolveRound(myMove, opponentMove);
            setGameStatus("Round finished! Click to play again.", false); // Buttons are disabled until reset
            
            // Only Player 1 initiates the database cleanup (resetMoves)
            if (playerNumber === 1) {
                resetMoves();
            }
            delay(3000);
            DOM.playerChoiceTextEl.textContent = "?";
            DOM.opponentChoiceTextEl.textContent = "?";
            setGameStatus("Make your choice for the next round.", true)

        } else if (myMove && !opponentMove) {
            // State: Player moved, waiting for opponent. Player's buttons are disabled.
            setGameStatus("Move submitted! Waiting for opponent's choice.", false);
        } else if (!myMove && opponentMove) {
            // State: Opponent moved, awaiting player. Player's buttons are ENABLED.
            setGameStatus("Opponent has submitted a choice. Make yours!", true);
        } else {
            // State: Both null. Both players are ENABLED.
            setGameStatus("Make your choice for the next round.", true);
        }
    }


    /** Handles state changes from the Firestore snapshot. (Main Loop) */
    async function handleRoomUpdate(data, currentUserId) {
        // Step 1: Initialize Role if not set (first time join or page refresh)
        if (!playerNumber) {
            console.log('assigning role');
            
            await assignPlayerRole(data, currentUserId);
            
            // If the role was JUST assigned, we exit this outdated function instance.
            // The listener will immediately re-call handleRoomUpdate with the fresh data.
            if (playerNumber) {
                console.log('Role assigned. Exiting current update cycle to await fresh data.');
                return;
            }
            
            // If the room was full and role still null, exit.
            if (!playerNumber) return; 
        }

        const isPlayer1 = playerNumber === 1;
        const myMove = isPlayer1 ? data.player1Move : data.player2Move;
        const opponentMove = isPlayer1 ? data.player2Move : data.player1Move;

        // Step 2: Update Choices UI
        if (myMove && opponentMove) {
            DOM.playerChoiceTextEl.textContent = myMove;
            DOM.opponentChoiceTextEl.textContent = opponentMove;   
        }

        // Step 3: Dispatch game state actions
        dispatchGameState(data, myMove, opponentMove);
    }
});
