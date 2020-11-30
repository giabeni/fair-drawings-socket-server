import { Module } from '@nestjs/common';
import { FirebaseModule } from 'nestjs-firebase';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DrawModule } from './draw/draw.module';

@Module({
  imports: [
    FirebaseModule.forRoot({
      googleApplicationCredential: './firebase-credentials.json',
    }),
    DrawModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
