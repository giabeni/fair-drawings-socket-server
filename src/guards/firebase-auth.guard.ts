import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { auth } from 'firebase-admin';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    let data = context.switchToWs().getData() as Array<any>;

    const method = context.getHandler().name;

    // idToken will be always the last element in message body
    if (!Array.isArray(data)) {
      data = [data];
    }
    const idToken = data && data.length ? data[data.length - 1] : undefined;

    if (!idToken) {
      console.error('TOKEN NULL ERROR: ', method, data);
      throw new WsException('UNAUTHORIZED');
    }

    const verify = await auth()
      .verifyIdToken(idToken)
      .catch((err) => {
        console.error('AUTH ERROR', method, data, err);
        throw new WsException('UNAUTHORIZED');
      });

    if (!verify) {
      console.error('AUTH UNDEFINED', method, data);
      throw new WsException('UNAUTHORIZED');
    }

    if (Array.isArray(context.switchToWs().getData())) {
      context.switchToWs().getData()[1] = verify;
    }

    return true;
  }
}
