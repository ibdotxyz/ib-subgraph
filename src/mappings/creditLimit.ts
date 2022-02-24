/* eslint-disable prefer-const */ // to satisfy AS compiler

import {
  CreditLimitChanged
} from '../../generated/Comptroller/Comptroller'

import { CreditLimit } from '../../generated/schema'
import { zeroBD } from '../helpers'

export function createCreditLimit(event: CreditLimitChanged): CreditLimit {
  let borrowerAddress = event.params.protocol
  let marketAddress = event.params.market

  let creditLimit = new CreditLimit(borrowerAddress.toHexString().concat('-').concat(marketAddress.toHexString()))
  creditLimit.borrower = borrowerAddress
  creditLimit.market = marketAddress.toHexString()
  creditLimit.creditLimit = zeroBD
  creditLimit.creditBorrow = zeroBD
  creditLimit.blockTimestamp = event.block.timestamp.toI32()

  return  creditLimit
}
