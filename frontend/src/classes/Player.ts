export default class Player {
  public location?: UserLocation;

  private readonly _id: string;

  private readonly _userName: string;

  private _permissions: ServerPlayerPermissions;

  public sprite?: Phaser.GameObjects.Sprite;

  public label?: Phaser.GameObjects.Text;

  constructor(id: string, userName: string, location: UserLocation, permissions: ServerPlayerPermissions) {
    this._id = id;
    this._userName = userName;
    this.location = location;
    this._permissions = permissions;
  }

  get userName(): string {
    return this._userName;
  }

  get id(): string {
    return this._id;
  }

  get permissions(): ServerPlayerPermissions {
    return this._permissions;
  }

  set permissions(newPermission: ServerPlayerPermissions) {
    this._permissions = newPermission;
  }

  static fromServerPlayer(playerFromServer: ServerPlayer): Player {
    return new Player(playerFromServer._id, playerFromServer._userName, playerFromServer.location, playerFromServer._permissions);
  }
}
export type ServerPlayer = {
  _id: string,
  _userName: string,
  location: UserLocation,
  _permissions: ServerPlayerPermissions;
};

export enum ServerPlayerPermissions {
  Normal,
  Admin,
}


export type Direction = 'front'|'back'|'left'|'right';

export type UserLocation = {
  x: number,
  y: number,
  rotation: Direction,
  moving: boolean,
  conversationLabel?: string
};
