import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MessageSquare, Database, Settings } from "lucide-react";
import { useAuth } from "@/context/auth-context";

interface TabsProps {
  currentPath: string;
  vertical?: boolean;
  onNavigate?: () => void;
}

export function Tabs({ currentPath, vertical = false, onNavigate }: TabsProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const handleNavigation = (path: string) => {
    setLocation(path);
    if (onNavigate) {
      onNavigate();
    }
  };

  const isAdmin = user?.role === "admin";

  const tabs = [
    {
      title: "チャット",
      path: "/chat",
      icon: <MessageSquare className="mr-2 h-4 w-4" />,
    },
    {
      title: "データ処理",
      path: "/processing",
      icon: <Database className="mr-2 h-4 w-4" />,
      adminOnly: true,
    },
    {
      title: "設定",
      path: "/settings",
      icon: <Settings className="mr-2 h-4 w-4" />,
    },
  ];

  const filteredTabs = tabs.filter(tab => !tab.adminOnly || isAdmin);

  return (
    <div className={cn(
      "bg-white",
      vertical ? "flex flex-col space-y-1" : "flex"
    )}>
      {filteredTabs.map((tab) => (
        <Button
          key={tab.path}
          variant="ghost"
          className={cn(
            vertical
              ? "justify-start px-3 py-2 w-full"
              : "px-4 py-3 rounded-none",
            currentPath === tab.path
              ? "text-primary border-primary font-medium " + 
                (vertical ? "" : "border-b-2")
              : "text-neutral-300"
          )}
          onClick={() => handleNavigation(tab.path)}
        >
          {tab.icon}
          {tab.title}
        </Button>
      ))}
    </div>
  );
}
