export type PlayerColour = 'white' | 'black';

export type GameStatus =
  | 'active'
  | 'checkmate'
  | 'stalemate'
  | 'draw'
  | 'resigned'
  | 'aborted';

export type SquareId = string;

export type PromotionPiece = 'q' | 'r' | 'b' | 'n';

export interface MoveRequest {
  from: SquareId;
  to: SquareId;
  promotion?: PromotionPiece;
}

export interface AppliedMove {
  san: string;
  uci: string;
  from: SquareId;
  to: SquareId;
  promotion?: PromotionPiece;
  captured?: string;
  isCheck: boolean;
  isCheckmate: boolean;
}

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface BoardPiece {
  square: SquareId;
  type: PieceType;
  colour: PlayerColour;
}

export interface GameStateSnapshot {
  fen: string;
  turn: PlayerColour;
  status: GameStatus;
  isCheck: boolean;
  pieces: BoardPiece[];
  lastMove?: { from: SquareId; to: SquareId };
  history: AppliedMove[];
}
