require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');
const fs = require('fs');
const { MongoClient, ServerApiVersion } = require('mongodb');
const dns = require('dns');

// Force Node.js to use Google DNS for resolution
dns.setServers(['8.8.8.8', '8.8.4.4']);

const app = express();
const PORT = process.env.PORT || 3000;

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI;
let db = null;
let surprisesCollection = null;
let isConnected = false;

// MongoDB Connection
async function connectToMongoDB() {
    if (!MONGODB_URI) {
        console.log('❌ MONGODB_URI not found in .env');
        return false;
    }

    try {
        console.log('🔄 Connecting to MongoDB...');

        const client = new MongoClient(MONGODB_URI, {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            },
            // Additional options for better connection handling
            connectTimeoutMS: 30000,
            socketTimeoutMS: 30000,
        });

        await client.connect();

        // Ping to confirm connection
        await client.db("admin").command({ ping: 1 });

        db = client.db('valentine');
        surprisesCollection = db.collection('surprises');
        isConnected = true;

        console.log('✅ Connected to MongoDB Atlas!');
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        return false;
    }
}

// DB Helper Functions
async function saveSurprise(data) {
    if (!isConnected) {
        throw new Error('Database not connected');
    }
    await surprisesCollection.insertOne(data);
}

async function findSurprise(id) {
    if (!isConnected) {
        throw new Error('Database not connected');
    }
    return await surprisesCollection.findOne({ id: id });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname)));

// Multer Storage (Memory for DB Storage)
const storage = multer.memoryStorage();

const upload = multer({ storage: storage });

// Email Transporter


const sharp = require('sharp'); // For image compression

// ... (previous imports)

// API: Create Surprise
app.post('/api/create-surprise', upload.array('photos', 5), async (req, res) => {
    try {
        const { partnerName, senderName } = req.body;
        const files = req.files;

        if (!files || files.length < 5) {
            return res.status(400).json({ error: 'Please upload 5 photos.' });
        }

        const id = crypto.randomBytes(8).toString('hex');
        const secretKey = crypto.randomBytes(4).toString('hex').toUpperCase();

        // Compress and encode images
        const validFiles = await Promise.all(files.map(async (file) => {
            const compressedBuffer = await sharp(file.buffer)
                .resize({ width: 800, withoutEnlargement: true }) // Resize to max width 800px
                .jpeg({ quality: 80 }) // Compress to JPEG with 80% quality
                .toBuffer();

            return {
                contentType: 'image/jpeg', // Always converting to JPEG
                data: compressedBuffer.toString('base64')
            };
        }));

        const surpriseData = {
            id,
            secretKey,
            partnerName,
            senderName,
            photos: validFiles,
            createdAt: new Date()
        };

        // Save to MongoDB
        await saveSurprise(surpriseData);
        console.log('✅ Surprise saved with ID:', id);

        // Generate Link
        // Use BASE_URL from env if set (e.g., in Render), otherwise build from request
        let baseUrl = process.env.BASE_URL;

        if (!baseUrl) {
            const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
            const host = req.get('host');
            baseUrl = `${protocol}://${host}`;
        }

        const link = `${baseUrl}/valentine.html?id=${id}`;

        res.json({ success: true, link, message: 'Surprise created!' });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error: ' + error.message });
    }
});

// API: Get Surprise (Direct Access - No Key Required)
app.get('/api/get-surprise/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const data = await findSurprise(id);

        if (!data) {
            return res.status(404).json({ error: 'Surprise not found.' });
        }

        res.json({ success: true, data });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// API: Check if surprise exists
app.get('/api/check-surprise/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const data = await findSurprise(id);
        if (data) {
            res.json({ exists: true, senderName: data.senderName });
        } else {
            res.json({ exists: false });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Root Route - Redirect to valentine.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'valentine.html'));
});

// Start Server
async function startServer() {
    const connected = await connectToMongoDB();

    if (!connected) {
        console.log('⚠️ Could not connect to MongoDB. Server will not start.');
        process.exit(1);
    }

    app.listen(PORT, () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
    });
}

startServer();
