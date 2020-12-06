import { Stakeholder } from './stakeholder.entity';
import { DrawStatus } from '../enums/draw-status.enum';
import { DrawData } from '../interfaces/draw-data.interface';
import { Commit } from '../../commit-reveal/interfaces/commit.interface';
import { Reveal } from '../../commit-reveal/interfaces/reveal.interface';
import { Candidate } from './candidate.entity';

export class Draw<D = DrawData> {
  /**
   * Unique identifier of a draw
   */
  public readonly uuid?: string;

  /**
   * Additional information related to the draw.
   * Using the D generic type (default is any);
   */
  public readonly data?: D;

  /**
   * The maximum number of candidates required to automatically start the draw.
   */
  public spots?: number;

  /**
   * The minimum number of candidates required to automatically start the draw.
   */
  public minSpots?: number;

  /**
   * The user id of the creator user
   */
  public creatorId?: string;

  /**
   * Current phase of draw.
   */
  public status?: DrawStatus;

  /**
   * The candidate that was drawn
   */
  public winner?: Candidate;

  /**
   * List of participants that can contribute to the draw.
   * Not all of them must be elegible to be drawn.
   */
  public stakeholders?: Stakeholder[] = [];

  /**
   * List of all commits registered in the draw
   */
  public readonly commits?: Commit[] = [];

  /**
   * List of all reveals registered in the draw
   */
  public readonly reveals?: (Reveal & { valid?: boolean })[] = [];

  /**
   * Timestamp of the creation date
   */
  public creationTimestamp?: number;

  public winnerAcks?: {
    userId: string;
    winner: Candidate;
  }[] = [];

  constructor(draw?: Draw<D>) {
    if (draw) {
      Object.assign(this, draw);
    }
  }
}
