const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // High limit to handle profile picture strings

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// Centralized Database (In-Memory for now)
const usersDB = {}; 
const activeSockets = {};

// Registration
app.post('/api/signup', async (req, res) => {
    const { username, password, avatar } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username and password required." });

    const normalizedUser = username.trim().toLowerCase();
    if (usersDB[normalizedUser]) return res.status(400).json({ error: "Account already exists!" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        usersDB[normalizedUser] = { username: normalizedUser, password: hashedPassword, avatar: avatar || "", friendsList: [] };
        res.status(201).json({ message: "Account created successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Error creating account." });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const normalizedUser = username.trim().toLowerCase();
    const user = usersDB[normalizedUser];

    if (!user) return res.status(400).json({ error: "Wrong credentials entered." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Wrong credentials entered." });

    res.status(200).json({ username: user.username, avatar: user.avatar, friendsList: user.friendsList });
});

// Discover Users
app.get('/api/discover/:username', (req, res) => {
    const requester = req.params.username.toLowerCase();
    const user = usersDB[requester];
    if (!user) return res.status(404).json({ error: "User not found" });

    const discoverable = Object.values(usersDB)
        .filter(u => u.username !== requester && !user.friendsList.includes(u.username))
        .map(u => ({ username: u.username, avatar: u.avatar }));
    res.json(discoverable);
});

// Add Friend
app.post('/api/friends/add', (req, res) => {
    const { myUsername, targetUsername } = req.body;
    const userA = usersDB[myUsername.toLowerCase()];
    const userB = usersDB[targetUsername.toLowerCase()];

    if (!userA || !userB) return res.status(404).json({ error: "User not found." });

    if (!userA.friendsList.includes(userB.username)) userA.friendsList.push(userB.username);
    if (!userB.friendsList.includes(userA.username)) userB.friendsList.push(userA.username);

    res.json({ success: true, friendsList: userA.friendsList });
});

// Live WebSocket Connections
io.on('connection', (socket) => {
    socket.on('register_user', (username) => {
        activeSockets[username.trim().toLowerCase()] = socket.id;
    });

    socket.on('chat message', (data) => {
        const receiverSocketId = activeSockets[data.receiver.toLowerCase()];
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('chat message', {
                sender: data.sender,
                receiver: data.receiver,
                message: data.message
            });
        }
    });

    socket.on('disconnect', () => {
        for (let user in activeSockets) {
            if (activeSockets[user] === socket.id) {
                delete activeSockets[user];
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000; // Dynamically uses Render's assigned port
server.listen(PORT, () => {
    console.log(`Server active on port ${PORT}`);
});
