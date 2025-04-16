import { Address, address } from '@solana/kit';
import { logErrorAndExit } from './logs';

export const addressParser =
  (identifier: string) =>
  (value: string): Address => {
    try {
      return address(value);
    } catch {
      logErrorAndExit(`Invalid ${identifier} address: "${value}"`);
    }
  };

export const addressOrBooleanParser =
  (identifier: string) =>
  (value: string | undefined): Address | boolean => {
    if (value === undefined) return true;
    return addressParser(identifier)(value);
  };
