import { UseGuards } from '@nestjs/common';
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
import { Draw } from './entities/draw.entity';
import { DrawEventType } from './enums/draw-event-type.enum';
import { Candidate } from './entities/candidate.entity';
import { Stakeholder } from './entities/stakeholder.entity';
import { DrawEvent } from './interfaces/draw-event.interface';

@WebSocketGateway()
export class DrawGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  draws: Draw[] = [];

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
    @MessageBody() drawBody: Draw,
    @ConnectedSocket() client: Socket,
  ) {
    console.log(
      `🚀 ~ file: draw.gateway.ts ~ line 52 ~ DrawGateway ~ drawBody`,
      drawBody,
    );

    drawBody.status = 0;
    drawBody.stakeholders = [];

    const createdDoc = await this.drawsRef
      .doc(drawBody.uuid)
      .set(drawBody)
      .catch((err) => {
        console.error(err);
        throw new WsException('ERR_CREATE_DRAW');
      });

    if (!createdDoc) {
      throw new WsException('ERR_CREATE_DRAW');
    }

    client.emit('myDrawCreated', drawBody);
  }

  @UseGuards(FirebaseAuthGuard)
  @SubscribeMessage('getDraw')
  async onGetDraw(
    @MessageBody() data: { user: any; drawUuid: string },
    @ConnectedSocket() client: Socket,
  ) {
    const drawDoc = this.drawsRef.doc(data.drawUuid);

    const drawSnapshot = await drawDoc.get();

    if (!drawSnapshot.exists) {
      throw new WsException('DRAW_NOT_FOUND');
    }

    const draw = drawSnapshot.data() as Draw;

    if (!draw) {
      throw new WsException('DRAW_NOT_FOUND');
    }

    draw.stakeholders = (await Promise.all(
      (draw.stakeholders || []).map(async (user: any) => {
        const userRecord = await auth().getUser(user.uid || user.id);

        return new Candidate<any>({
          id: userRecord.uid,
          indexes: user.indexes,
          eligible: true,
          profile: {
            email: userRecord.email,
            firstName: userRecord.displayName.split(' ')[0],
            lastName: userRecord.displayName.split(' ', 2)[1],
            avatar: userRecord.photoURL,
          },
        });
      }),
    )) as Candidate<any>[];

    console.log('Draw before emit', draw);

    client.emit('getDraw', draw);
  }

  @UseGuards(FirebaseAuthGuard)
  @SubscribeMessage('joinDraw')
  async onJoinDraw(
    @MessageBody() data: { stakeholder: Stakeholder; drawUuid: string },
    @ConnectedSocket() client: Socket,
  ) {
    const drawDoc = this.drawsRef.doc(data.drawUuid);

    const drawSnapshot = await drawDoc.get();

    if (!drawSnapshot.exists) {
      throw new WsException('DRAW_NOT_FOUND');
    }

    const draw = drawSnapshot.data() as Draw;

    if (
      draw.stakeholders &&
      draw.stakeholders.find((stk) => stk.id === data.stakeholder.id)
    ) {
      client.emit('drawJoined');
      throw new WsException('STAKEHOLDER_ALREADY_REGISTERED');
    }

    console.log(`🚀 ~ file: draw.gateway.ts ~ line 177 ~ data`, data);
    const candidate: Candidate = {
      ...data.stakeholder,
      indexes: [draw.stakeholders ? draw.stakeholders.length : 0],
      eligible: true,
    };

    const joined = await drawDoc
      .update({
        stakeholders: firestore.FieldValue.arrayUnion(candidate),
      })
      .catch((err) => {
        console.error('Error updating doc', err);
        throw new Error(err);
      });

    if (joined) {
      client.emit('drawJoined');
    }

    const fullCandidate = (await this.getStakeholderFromUserId(
      data.stakeholder.id,
    )) as Candidate;
    fullCandidate.eligible = true;
    fullCandidate.indexes = candidate.indexes;

    const event: DrawEvent = {
      timestamp: new Date().getTime(),
      type: DrawEventType.CANDIDATE_SUBSCRIBED,
      data: fullCandidate,
      drawUuid: data.drawUuid,
    };

    console.log(`🚀 ~ file: draw.gateway.ts ~ line 206 ~ event`, event);
    console.log('Rooms client is in', client.rooms);
    client.server.to(data.drawUuid).emit('drawEvent', event);
  }

  @UseGuards(FirebaseAuthGuard)
  @SubscribeMessage('listenDraw')
  async onListenToDraw(
    @MessageBody() data: { user: any; drawUuid: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(data.drawUuid);

    const event: DrawEvent = {
      timestamp: new Date().getTime(),
      type: DrawEventType.STAKEHOLDER_SUBSCRIBED,
      data: await this.getStakeholderFromUserId(data.user.id || data.user.uid),
      drawUuid: data.drawUuid,
    };

    const draw = this.draws.find((draw) => draw.uuid === data.drawUuid);

    if (!draw) {
      throw new WsException('DRAW_NOT_FOUND');
    }

    client.emit('drawListened', event);
  }

  @UseGuards(FirebaseAuthGuard)
  @SubscribeMessage('postToDraw')
  async onPostToDraw(
    @MessageBody() event: DrawEvent,
    @ConnectedSocket() client: Socket,
  ) {
    console.log('> Event to draw ', event);

    if (event.from && event.from.id) {
      const stakeholder = await this.getStakeholderFromUserId(event.from.id);
      if (!stakeholder) {
        throw new Error('No valid stakeholder found');
      }
      event.from = stakeholder;
    }

    event.eventId = (+new Date()).toString(36);

    client.server.to(event.drawUuid).emit('drawEvent', event);

    if (event.type === DrawEventType.STATUS_CHANGED) {
      const drawDoc = await this.drawsRef.doc(event.drawUuid).get();

      if (drawDoc.exists && drawDoc.data().status !== event.data) {
        await this.drawsRef.doc(event.drawUuid).update({
          status: event.data,
        });
      }
    }

    client.emit('eventPosted', true);
  }

  async getStakeholderFromUserId(userId: string) {
    const userRecord = await auth().getUser(userId);

    if (!userRecord) {
      return undefined;
    }

    return new Stakeholder<any>({
      id: userRecord.uid,
      eligible: true,
      profile: {
        email: userRecord.email,
        firstName: userRecord.displayName.split(' ')[0],
        lastName: userRecord.displayName.split(' ', 2)[1],
        avatar: userRecord.photoURL,
      },
    });
  }
}
