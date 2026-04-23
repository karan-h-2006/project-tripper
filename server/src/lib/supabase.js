const { createClient } = require("@supabase/supabase-js");

let supabaseClient;

const getSupabase = () => {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Supabase environment variables are not configured. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required on the server."
    );
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
};

module.exports = {
  getSupabase,
};
