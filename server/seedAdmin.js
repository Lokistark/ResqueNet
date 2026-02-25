const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB for seeding...');

        // Ensure naveen04@gmail.com exists as Admin
        const admin1 = await User.findOne({ email: 'naveen04@gmail.com' });
        if (admin1) {
            admin1.role = 'admin';
            admin1.password = 'naveen04';
            await admin1.save();
        } else {
            await User.create({ name: 'Naveen Admin', email: 'naveen04@gmail.com', password: 'naveen04', role: 'admin' });
        }

        // Ensure naveen@gmail.com exists as Admin
        const admin2 = await User.findOne({ email: 'naveen@gmail.com' });
        if (admin2) {
            admin2.role = 'admin';
            admin2.password = 'naveen04';
            await admin2.save();
        } else {
            await User.create({ name: 'Naveen Primary', email: 'naveen@gmail.com', password: 'naveen04', role: 'admin' });
        }

        console.log('✅ Admin users updated/created successfully!');

        mongoose.connection.close();
        process.exit(0);
    } catch (err) {
        console.error('Error seeding admin:', err);
        process.exit(1);
    }
};

seedAdmin();
