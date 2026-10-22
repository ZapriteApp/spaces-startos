import { sdk } from '../sdk'
import { openAuction, placeBid, registerSpace } from './auctions'
import { createWallet } from './createWallet'
import { dashboardPassword } from './dashboardPassword'
import { trustId } from './trustId'
import { balance, depositAddress, listSpaces } from './walletInfo'

export const actions = sdk.Actions.of()
  .addAction(dashboardPassword)
  .addAction(trustId)
  .addAction(createWallet)
  .addAction(depositAddress)
  .addAction(balance)
  .addAction(listSpaces)
  .addAction(openAuction)
  .addAction(placeBid)
  .addAction(registerSpace)
