/**
 * This file provides a middleware that helps handle async/await errors gracefully
 * by passing them to the Express error handler.
 */

import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Wraps an async function, catching and passing any rejected Promises to next().
 * @param fn - An async Express handler
 * @returns A function that can be used as an Express middleware
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
): RequestHandler => {
  return (req, res, next) => fn(req, res, next).catch(next);
};
