import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  isRunning(): string {
    return 'API is running!';
  }
}
