import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  constructor() {
    console.log('Contructing guard.');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // console.log('Authenticating...');
    const client = context.switchToWs().getClient();
    // console.log(`🚀 ~ CONNECTION METADATA`, client.handshake);

    return true;
  }
}
