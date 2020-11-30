import { OnModuleInit, UseGuards } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Server } from 'http';
import { Socket } from 'socket.io';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { FirebaseAdmin, InjectFirebaseAdmin } from 'nestjs-firebase';
import { CollectionReference, QuerySnapshot } from '@google-cloud/firestore';
import { firestore, auth } from 'firebase-admin';

@WebSocketGateway()
export class DrawGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  draws: any[] = [];

  drawsRef: CollectionReference<any>;

  constructor(
    @InjectFirebaseAdmin() private readonly firebase: FirebaseAdmin,
  ) {}

  afterInit() {
    this.drawsRef = this.firebase.db.collection('draws');

    this.drawsRef.onSnapshot((drawsSnapshot: QuerySnapshot) => {
      this.draws = drawsSnapshot.docs.map((doc) => {
        return {
          uuid: doc.id,
          ...doc.data(),
        };
      });
      this.server.emit('getDrawList', this.draws);
    });
  }

  @UseGuards(FirebaseAuthGuard)
  async handleConnection(@ConnectedSocket() client: Socket) {
    /** @TODO handle authentication */

    console.log('New peer connected', client.handshake.address);
  }

  async handleDisconnect(@ConnectedSocket() client: Socket) {
    console.log('Peer disconnected', client.handshake.address);
  }

  @UseGuards(FirebaseAuthGuard)
  @SubscribeMessage('getDrawList')
  async onGetDrawList(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    client.emit('getDrawList', this.draws);
  }

  @UseGuards(FirebaseAuthGuard)
  @SubscribeMessage('createDraw')
  async onCreateDraw(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(
      `🚀 ~ file: draw.gateway.ts ~ line 52 ~ DrawGateway ~ data`,
      data,
    );

    const createdDoc = await this.drawsRef.add(data).catch((err) => {
      console.error(err);
      throw new WsException('ERR_CREATE_DRAW');
    });

    if (!createdDoc) {
      throw new WsException('ERR_CREATE_DRAW');
    }

    client.emit('myDrawCreated', data);
  }

  @UseGuards(FirebaseAuthGuard)
  @SubscribeMessage('getDraw')
  async onGetDraw(
    @MessageBody() data: { user: any; drawId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const draw = this.draws.find((draw) => draw.uuid === data.drawId);

    if (!draw) {
      throw new WsException('DRAW_NOT_FOUND');
    }

    draw.candidates = await Promise.all(
      draw.candidates.map(async (user: any) => {
        const userRecord = await auth().getUser(user.id);

        return {
          uid: userRecord.uid,
          email: userRecord.email,
          firstName: userRecord.displayName.split(' ')[0],
          lastName: userRecord.displayName.split(' ', 2)[1],
          avatar: userRecord.photoURL,
        };
      }),
    );

    console.log('Draw before emit', draw);

    client.emit('getDraw', draw);
  }

  @UseGuards(FirebaseAuthGuard)
  @SubscribeMessage('joinDraw')
  async onJoinDraw(
    @MessageBody() data: { user: any; drawId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.drawId);

    const event = {
      timestamp: new Date().getTime(),
      type: 'CANDIDATE_SUBSCRIBED',
      data,
    };

    const draw = this.draws.find((draw) => draw.uuid === data.drawId);

    if (!draw) {
      throw new WsException('DRAW_NOT_FOUND');
    }

    const drawDoc = this.drawsRef.doc(`${draw.uuid}`);

    const joined = await drawDoc
      .update({
        candidates: firestore.FieldValue.arrayUnion(data.user),
      })
      .catch((err) => {
        console.error('Error updating doc', err);
        throw new Error(err);
      });

    if (joined) {
      client.emit('drawJoined');
    }

    client.to(data.drawId).emit('drawEvent', event);
  }
}
