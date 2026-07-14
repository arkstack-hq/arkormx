import { Model } from '../../../../src'
import { User } from './User'

export class Profile extends Model {
  protected static override table = 'userProfile'

  public user() {
    return this.belongsTo(User, 'userId')
  }

  public resolveRouteBinding(value: unknown, field = 'id') {
    return Profile.hydrate({
      id: 7,
      routeValue: value,
      routeField: field,
    })
  }
}
