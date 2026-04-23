const { getSupabase } = require("../lib/supabase");

const connectDB = async () => {
  const supabase = getSupabase();
  const { error } = await supabase.from("users").select("id").limit(1);

  if (error) {
    console.error("Supabase connection error:", error.message);
    throw error;
  }

  console.log("Supabase connected");
};

module.exports = connectDB;
