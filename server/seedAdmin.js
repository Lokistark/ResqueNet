const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB for seeding...');

        // Check if admin already exists
        const adminExists = await User.findOne({ email: 'naveen04@gmail.com' });
        if (adminExists) {
            console.log('Admin user already exists. Updating credentials...');
            adminExists.password = 'naveen04'; // The pre-save hook will hash this
            await adminExists.save();
        } else {
            await User.create({
                name: 'Naveen',
                email: 'naveen04@gmail.com',
                password: 'naveen04',
                role: 'admin'
            });
            console.log('Admin user created successfully!');
        }

        mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Error seeding admin:', err);
        process.exit(1);
    }
};

seedAdmin();
