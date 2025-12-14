import { Request, Response, NextFunction } from 'express';

/**
 * JSON-only middleware to ensure all API responses are JSON
 * Prevents HTML error pages from being sent
 */
export const ensureJsonResponse = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Override res.send to always use JSON for API routes
  const originalSend = res.send;
  
  res.send = function (data: any): Response {
    // If response hasn't been sent and this is an API route
    if (!res.headersSent && req.path.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      
      // If data is not already JSON, wrap it
      if (typeof data !== 'object') {
        data = { data };
      }
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};
