import { Search } from "lucide-react";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="h-[80vh] flex flex-col items-center justify-center text-center animate-in fade-in duration-300">
      <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-6">
        <Search className="w-8 h-8 text-muted-foreground" />
      </div>
      <h1 className="text-3xl font-bold tracking-tight mb-2">Query Returned Null</h1>
      <p className="text-muted-foreground max-w-md mb-8">
        The record or view you are looking for does not exist in the current dataset or may have been archived.
      </p>
      <Link href="/" className="inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors">
        Return to Dashboard
      </Link>
    </div>
  );
}
