/**
 * Utility functions to transform database results
 * Converts snake_case to camelCase for frontend compatibility
 */

/**
 * Convert snake_case string to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert an object's keys from snake_case to camelCase
 */
export function keysToCamel<T>(obj: any): T {
  if (Array.isArray(obj)) {
    return obj.map(v => keysToCamel<T>(v)) as any;
  } else if (obj !== null && obj !== undefined && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const camelKey = snakeToCamel(key);
      result[camelKey] = keysToCamel(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}

/**
 * Convert camelCase string to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Convert an object's keys from camelCase to snake_case
 */
export function keysToSnake<T>(obj: any): T {
  if (Array.isArray(obj)) {
    return obj.map(v => keysToSnake<T>(v)) as any;
  } else if (obj !== null && obj !== undefined && obj.constructor === Object) {
    return Object.keys(obj).reduce((result, key) => {
      const snakeKey = camelToSnake(key);
      result[snakeKey] = keysToSnake(obj[key]);
      return result;
    }, {} as any);
  }
  return obj;
}
