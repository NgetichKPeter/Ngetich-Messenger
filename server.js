const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
// Set 10mb limit so large profile picture strings don't crash your server
app.use(express.json({ limit: '10mb' })); 

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Centralized Database Layer (In-Memory Data Structures)
const usersDB = {}; 
const activeSockets = {};

// --- API ROUTES ---

// Registration Route
app.post('/api/signup', async (req, res) => {
    const { username, password, avatar } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    const normalizedUser = username.trim().toLowerCase();
    if (usersDB[normalizedUser]) {
        return res.status(400).json({ error: "Account already exists!" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        usersDB[normalizedUser] = {
            username: normalizedUser,
            password: hashedPassword,
            avatar: avatar || "",
            friendsList: []
        };
        res.status(201).json({ message: "Account created successfully!" });
    } catch (err) {
        res.status(500).json({ error: "System error compiling security profile." });
    }
});

// Secure Authentication Login Route
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const normalizedUser = username.trim().toLowerCase();
    const user = usersDB[normalizedUser];

    if (!user) {
        return res.status(400).json({ error: "Wrong credentials entered." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        return res.status(400).json({ error: "Wrong credentials entered." });
    }

    // Return profile parameters to client without sensitive structural info
    res.status(200).json({
        username: user.username,
        avatar: user.avatar,
        friendsList: user.friendsList
    });
});

// Global Discover Engine Route
app.get('/api/discover/:username', (req, res) => {
    const requester = req.params.username.toLowerCase();
    const user = usersDB[requester];
    if (!user) return res.status(404).json({ error: "User mismatch." });

    // Filter out users who are already friends or are the user themselves
    const discoverable = Object.values(usersDB)
        .filter(u => u.username !== requester && !user.friendsList.includes(u.username))
        .map(u => ({ username: u.username, avatar: u.avatar }));
        
    res.json(discoverable);
});

// Friend Link Creation Route
app.post('/api/friends/add', (req, res) => {
    const { myUsername, targetUsername } = req.body;
    const userA = usersDB[myUsername.toLowerCase()];
    const userB = usersDB[targetUsername.toLowerCase()];

    if (!userA || !userB) return res.status(404).json({ error: "Data pipeline failed." });

    if (!userA.friendsList.includes(userB.username)) userA.friendsList.push(userB.username);
    if (!userB.friendsList.includes(userA.username)) userB.friendsList.push(userA.username);

    res.json({ success: true, friendsList: userA.friendsList });
});


// --- REAL-TIME WEBSOCKET MAPPING ENGINE ---

io.on('connection', (socket) => {
    
    // Register active user map linking back to socket ID
    socket.on('register_user', (username) => {
        activeSockets[username.trim().toLowerCase()] = socket.id;
    });

    // Intercept client chat packets and route them instantly to peers
    socket.on('chat message', (data) => {
        const targetSocketId = activeSockets[data.receiver.toLowerCase()];
        if (targetSocketId) {
            io.to(targetSocketId).emit('chat message', {
                sender: data.sender,
                receiver: data.receiver,
                message: data.message // Stays completely encrypted under Caesar shift cipher
            });
        }
    });

    // Remove active socket reference upon disconnection
    socket.on('disconnect', () => {
        for (let user in activeSockets) {
            if (activeSockets[user] === socket.id) {
                delete activeSockets[user];
                break;
            }
        }
    });
});

// Dynamic port assignment tailored directly for Render environment deployments
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Ngetich Engine live on port ${PORT}`);
});
