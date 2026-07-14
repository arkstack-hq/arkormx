import { Model } from '../../../../src'
import { Profile } from './Profile'

export class User extends Model<{ isActive: string }> {
  protected static override table = 'users'
  declare isActive: string

  public profile() {
    return this.hasOne(Profile, 'userId')
  }
}
