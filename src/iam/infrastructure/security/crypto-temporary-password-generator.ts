import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { ITemporaryPasswordGeneratorPort } from '../../application/ports/temporary-password-generator.port';

// Look-alike characters (I, O, l, o, 0, 1) are left out: the password is often
// read from a screen or a message and typed by hand.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '#$%&*+?@!';
const LENGTH = 8;

const pick = (alphabet: string): string => alphabet[randomInt(alphabet.length)];

/**
 * Eight characters: at least one upper-case letter, one lower-case letter and
 * one digit, and exactly one symbol, so it also meets the signup strength rule.
 * Every choice and the final order come from crypto.randomInt.
 */
@Injectable()
export class CryptoTemporaryPasswordGenerator implements ITemporaryPasswordGeneratorPort {
  generate(): string {
    const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
    const rest = UPPER + LOWER + DIGITS;
    while (chars.length < LENGTH) chars.push(pick(rest));

    // Fisher-Yates, so the guaranteed characters are not always in front.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }
}
