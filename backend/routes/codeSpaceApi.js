const express = require('express');
const Codespace = require('../models/codeSpace');

module.exports = (io) => {
    const router = express.Router();

    // Get or Create a Codespace
    router.post('/', async (req, res) => {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ msg: 'Codespace name is required' });
        }

        try {
            let codespace = await Codespace.findOne({ name });

            if (codespace) {
                // If it exists, return it
                return res.json(codespace);
            } else {
                // If not, create a new one with a default file
                const newCodespace = new Codespace({
                    name,
                    files: [{ name: 'index.html', language: 'html', content: '<h1>Welcome to your new CodeSpace!</h1>' }]
                });
                await newCodespace.save();
                return res.status(201).json(newCodespace);
            }
        } catch (error) {
            res.status(500).json({ msg: 'Server error', error });
        }
    });

    router.get('/:name', async (req, res) => {
        try {
            const codespace = await Codespace.findOne({ name: req.params.name });
            if (!codespace) {
                return res.status(404).json({ msg: 'Codespace not found.' });
            }
            res.json(codespace);
        } catch (error) {
            res.status(500).json({ msg: 'Server Error' });
        }
    });

    // --- NEW: Verify a passcode for a private room ---
    router.post('/:name/verify', async (req, res) => {
        const { passcode } = req.body;
        try {
            const codespace = await Codespace.findOne({ name: req.params.name });

            if (!codespace) {
                return res.status(404).json({ success: false, message: 'Codespace not found.' });
            }

            // IMPORTANT: In production, you would use bcrypt.compare() here!
            // This is a plain-text comparison for demonstration purposes only.
            if (codespace.passcode === passcode) {
                res.json({ success: true });
            } else {
                res.status(401).json({ success: false, message: 'Incorrect passcode.' });
            }
        } catch (error) {
            res.status(500).json({ success: false, message: 'Server Error' });
        }
    });

    router.patch('/:name/privacy', async (req, res) => {
        const { name } = req.params;
        const { isPublic, passcode } = req.body;

        try {
            const updatedCodespace = await Codespace.findOneAndUpdate(
                { name },
                { $set: { isPublic, passcode } }, // In production, use hashedPassword
                { new: true }
            );

            if (!updatedCodespace) {
                return res.status(404).json({ msg: 'Codespace not found' });
            }

            res.json({
                isPublic: updatedCodespace.isPublic,
                hasPasscode: !!updatedCodespace.passcode,
            });
        } catch (error) {
            res.status(500).json({ msg: 'Server error', error });
        }
    });

    router.get('/:name/status', async (req, res) => {
        try {
            const codespace = await Codespace.findOne({ name: req.params.name }).select('isPublic');
            if (!codespace) {
                return res.status(404).json({ msg: 'Codespace not found.' });
            }
            res.json({ isPublic: codespace.isPublic });
        } catch (error) {
            res.status(500).json({ msg: 'Server Error' });
        }
    });

    // --- NEW: Secure endpoint to get data with a passcode ---
    router.post('/:name/data', async (req, res) => {
        const { passcode } = req.body; // Passcode is now sent in the body

        try {
            const codespace = await Codespace.findOne({ name: req.params.name });
            if (!codespace) {
                return res.status(404).json({ msg: 'Codespace not found.' });
            }

            // If the room is public, always grant access, even if no passcode was sent.
            if (codespace.isPublic) {
                return res.json(codespace);
            }

            // If the room is private, we MUST verify the provided passcode.
            // NOTE: In production, use bcrypt.compare(passcode, codespace.passcode)
            if (codespace.passcode === passcode) {
                return res.json(codespace);
            } else {
                // If the passcode is wrong or missing for a private room, deny access.
                return res.status(401).json({ msg: 'Incorrect passcode.' });
            }
        } catch (error) {
            res.status(500).json({ msg: 'Server Error' });
        }
    });

    router.delete("/:name/delete", async (req, res) => {
        const { file } = req.body; // file = filename (string)

        try {
            const codespace = await Codespace.findOneAndUpdate(
                { name: req.params.name },
                {
                    $pull: {
                        files: { name: file }
                    }
                },
                { new: true } // return updated document
            );

            if (!codespace) {
                return res.status(404).json({ msg: "Codespace not found." });
            }

            // Emit WebSocket event to notify all clients in the room about file deletion
            io.to(req.params.name).emit('file-deleted', { fileName: file, files: codespace.files });

            return res.json({
                msg: `File '${file}' deleted successfully`,
                codespace
            });

        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    });


    // ... other routes for updating privacy, etc. can be added here ...

    return router;
};