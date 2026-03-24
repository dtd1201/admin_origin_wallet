import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const AdminNotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#08131e] px-6 text-white">
      <div className="max-w-lg text-center">
        <div className="text-sm uppercase tracking-[0.35em] text-emerald-300/75">404</div>
        <h1 className="mt-4 text-5xl font-bold">Admin page not found</h1>
        <p className="mt-4 text-lg leading-8 text-slate-300">
          The route does not exist in the new admin frontend project.
        </p>
        <Button asChild className="mt-8 rounded-full bg-emerald-400 px-6 text-slate-950 hover:bg-emerald-300">
          <Link to="/admin">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  );
};

export default AdminNotFound;
