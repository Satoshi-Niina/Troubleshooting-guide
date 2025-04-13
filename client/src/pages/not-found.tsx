import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Server, Brain } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

export default function NotFound() {
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiStatus, setApiStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const testHealthApi = async () => {
    setIsLoading(true);
    setApiStatus('idle');
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setApiResponse(JSON.stringify(data, null, 2));
      setApiStatus('success');
    } catch (error) {
      console.error('API test failed:', error);
      setApiResponse(String(error));
      setApiStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  const testOpenAiApi = async () => {
    setIsLoading(true);
    setApiStatus('idle');
    try {
      const response = await fetch('/api/chatgpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello, this is a test of the OpenAI API connection.' })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      
      const data = await response.json();
      setApiResponse(data.response);
      setApiStatus('success');
    } catch (error) {
      console.error('OpenAI API test failed:', error);
      setApiResponse(String(error));
      setApiStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md mb-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="text-sm text-gray-600">
            The page you're looking for doesn't exist or has been moved.
          </p>
          
          <div className="mt-4">
            <Link href="/" className="text-blue-600 hover:underline text-sm">
              Return to Home
            </Link>
          </div>
        </CardContent>
      </Card>
      
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">API Connection Test</h2>
          
          <div className="flex gap-3 mb-4">
            <Button 
              onClick={testHealthApi} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              <Server className="h-4 w-4" />
              Test Health API
            </Button>
            
            <Button 
              onClick={testOpenAiApi} 
              disabled={isLoading}
              variant="secondary"
              className="flex items-center gap-2"
            >
              <Brain className="h-4 w-4" />
              Test OpenAI API
            </Button>
          </div>
          
          {isLoading && (
            <div className="py-4 text-center text-gray-600">
              Loading...
            </div>
          )}
          
          {!isLoading && apiResponse && (
            <div className="mt-2">
              <div className={`text-sm font-medium mb-1 ${apiStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                {apiStatus === 'success' ? 'Success!' : 'Error:'}
              </div>
              <pre className="bg-gray-100 p-3 rounded-md text-xs overflow-x-auto max-h-64 overflow-y-auto">
                {apiResponse}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
