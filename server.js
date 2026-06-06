async function launchDashboard(username) {
    myUsername = username;
    showScreen('app-container');
    
    // Connect to your Render instance
    socket = io("https://ngetich-messenger.onrender.com");

    // Inform the server who owns this WebSocket connection
    socket.emit('register_user', username);

    // Listen for incoming live text transmissions
    socket.on('chat message', (data) => {
        if ((data.sender === myUsername && data.receiver === activeChatPartner) ||
            (data.sender === activeChatPartner && data.receiver === myUsername)) {
            data.message = decryptText(data.message, SECRET_KEY);
            displayMessage(data);
        }
    });

    switchTab('friends');
}
