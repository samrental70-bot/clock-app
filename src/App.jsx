import { useEffect } from "react";
import EmployeeClockApp from "./EmployeeClockApp";
import { supabase } from "./supabaseClient";

export default function App() {
  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    const { data, error } = await supabase.from("employees").select("*");

    if (error) {
      console.log("Supabase error:", error);
    } else {
      console.log("Supabase connected:", data);
    }
  };

  return <EmployeeClockApp />;
}