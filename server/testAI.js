// server/testAI.js
const mongoose = require('mongoose');
require('dotenv').config(); // Loads your .env file

const budgetEmitter = require('./src/events/budgetEvents');
const Trip = require('./src/models/Trip');
const Itinerary = require('./src/models/Itinerary');

// 1. We mock Socket.io so we don't need a frontend or Karan's code to test
const mockIO = {
  to: (room) => ({
    emit: (event, data) => {
      console.log(`\n🟢 [SOCKET MOCK SUCCESS] Emitted '${event}' to room '${room}'`);
      console.log(`🟢 [SOCKET DATA]:`, data, `\n`);
      
      console.log("Test Complete! Exiting...");
      process.exit(0); // Kills the script successfully
    }
  })
};

async function runTest() {
  try {
    // Connect to your MongoDB using the URI in your .env
    await mongoose.connect(process.env.MONGO_URI);
    console.log("1. Connected to Database...");

    // 2. Create dummy data so your AI service has something to find and "optimize"
    const dummyTrip = await Trip.create({ 
        name: "AI Test Trip", 
        join_code: "AI1234",
        total_budget: 5000
    });
    
    await Itinerary.create({
        tripId: dummyTrip._id,
        title: "Super Expensive Luxury Resort",
        estimated_cost: 2000
    });
    console.log(`2. Created Dummy Trip (ID: ${dummyTrip._id})...`);

    // 3. FIRE THE ALARM! (This is what Vikas's code will eventually do)
    console.log("3. Firing the 'budget_critical' event (Simulating Vikas's trigger)...");
    
    // We pass your dummy trip ID and our fake socket into your listener
    budgetEmitter.emit("budget_critical", dummyTrip._id.toString(), mockIO);

  } catch (error) {
    console.error("Test setup failed (Check if your DB is running):", error);
    process.exit(1);
  }
}

runTest();