/* eslint-disable prefer-const */ // to satisfy AS compiler

import { Address } from '@graphprotocol/graph-ts'
import { Market } from '../../generated/schema'
import { CToken } from '../../generated/templates'
import { ERC20 } from '../../generated/templates/CToken/ERC20'
import { CCollateralCapErc20 } from '../../generated/templates/CToken/CCollateralCapErc20'

import {
  zeroBD,
  initialExchangeRate
} from '../helpers'

export function createMarket(marketAddress: Address): Market {
  let contract = CCollateralCapErc20.bind(marketAddress)

  // Index new market
  CToken.create(marketAddress)

  let market: Market
  market = new Market(marketAddress.toHexString())
  market.address = marketAddress
  market.symbol = contract.symbol()
  market.name = contract.name()

  market.underlyingAddress = contract.underlying()
  let underlyingContract = ERC20.bind(market.underlyingAddress as Address)
  let underlyingDecimals = underlyingContract.try_decimals()
  if (underlyingDecimals.reverted) {
    // assume underlying not deploy yet
    market.underlyingDecimals = 18
    market.underlyingSymbol = ''
    market.underlyingName = ''
  } else {
    market.underlyingDecimals = underlyingDecimals.value
    market.underlyingSymbol = underlyingContract.symbol()
    market.underlyingName = underlyingContract.name()
  }

  market.implementation = contract.implementation()
  market.interestRateModelAddress = contract.interestRateModel()
  market.collateralFactor = zeroBD
  market.reserveFactor = zeroBD

  market.collateralCap = zeroBD
  market.supplyCap = zeroBD
  market.borrowCap = zeroBD

  market.supplyPaused = false
  market.borrowPaused = false
  market.flashloanPaused = false
  market.delisted = false

  market.creditLimits = []

  market.cash = zeroBD
  market.exchangeRate = initialExchangeRate
  market.totalBorrows = zeroBD
  market.totalSupply = zeroBD
  market.totalCollateralTokens = zeroBD
  market.blockTimestamp = 0

  return market
}
