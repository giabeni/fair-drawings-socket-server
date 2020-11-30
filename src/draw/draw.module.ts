import { Module } from '@nestjs/common';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { DrawGateway } from './draw.gateway';

@Module({
  providers: [DrawGateway, FirebaseAuthGuard],
})
export class DrawModule {}
