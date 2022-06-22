/* eslint-disable prefer-const */ // to satisfy AS compiler

import {
  NewAdmin,
  NewImplementation,
  NewCloseFactor,
  NewLiquidationIncentive,
  NewPriceOracle,
  NewPauseGuardian,
  NewLiquidityMining,
  ActionPaused,
  ActionPaused1,
  MarketListed,
  MarketDelisted,
  MarketEntered,
  MarketExited,
  NewCollateralFactor,
  NewBorrowCap,
  NewSupplyCap,
  CreditLimitChanged
} from '../../generated/Comptroller/Comptroller'

import { Address } from '@graphprotocol/graph-ts'
import { Comptroller as ComptrollerContract } from '../../generated/Comptroller/Comptroller'
import { Account, Market, Comptroller, CreditLimit } from '../../generated/schema'
import { exponentToBigDecimal, mantissaFactorBD} from '../helpers'
import { createAccount, updateCommonCTokenStats } from './account'
import { createCreditLimit } from './creditlimit'
import { createMarket } from './market'

function createComptroller(address: Address): Comptroller {
  let contract = ComptrollerContract.bind(address)

  let comptroller = new Comptroller('1')
  comptroller.address = address
  comptroller.admin = contract.admin()
  comptroller.implementation = contract.comptrollerImplementation()
  comptroller.totalMarkets = 0

  return comptroller
}

export function handleNewAdmin(event: NewAdmin): void {
  let comptroller = Comptroller.load('1') as Comptroller
  comptroller.admin = event.params.newAdmin
  comptroller.save()
}

export function handleNewImplementation(event: NewImplementation): void {
  let comptroller = Comptroller.load('1')
  if (comptroller == null) {
    comptroller = createComptroller(event.address)
  }
  comptroller.implementation = event.params.newImplementation
  comptroller.save()
}

export function handleNewCloseFactor(event: NewCloseFactor): void {
  let comptroller = Comptroller.load('1') as Comptroller
  // This is the first event used in this mapping, so we use it to create the entity
  if (comptroller == null) {
    comptroller = createComptroller(event.address)
  }
  comptroller.closeFactor = event.params.newCloseFactorMantissa
  comptroller.save()
}

// This should be the first event according to etherscan but it isn't.... price oracle is. weird
export function handleNewLiquidationIncentive(event: NewLiquidationIncentive): void {
  let comptroller = Comptroller.load('1') as Comptroller
  // This is the first event used in this mapping, so we use it to create the entity
  if (comptroller == null) {
    comptroller = createComptroller(event.address)
  }
  comptroller.liquidationIncentive = event.params.newLiquidationIncentiveMantissa
  comptroller.save()
}

export function handleNewPriceOracle(event: NewPriceOracle): void {
  let comptroller = Comptroller.load('1')
  // This is the first event used in this mapping, so we use it to create the entity
  if (comptroller == null) {
    comptroller = createComptroller(event.address)
  }
  comptroller.priceOracle = event.params.newPriceOracle
  comptroller.save()
}

export function handleNewPauseGuardian(event: NewPauseGuardian): void {
  let comptroller = Comptroller.load('1') as Comptroller
  comptroller.pauseGuardian = event.params.newPauseGuardian
  comptroller.save()
}

export function handleNewLiquidityMining(event: NewLiquidityMining): void {
  let comptroller = Comptroller.load('1') as Comptroller
  comptroller.liquidityMining = event.params.newLiquidityMining
  comptroller.save()
}

export function handleGlobalActionPaused(event: ActionPaused):void {
  let comptroller = Comptroller.load('1') as Comptroller
  let action = event.params.action
  let pauseState = event.params.pauseState
  if (action == 'Transfer'){
    comptroller.transferGuardianPaused = pauseState
    comptroller.save()
  } else if (action == 'Seize'){
    comptroller.seizeGuardianPaused = pauseState
    comptroller.save()
  }

}

export function handleCTokenActionPaused(event: ActionPaused1): void {
  let market = Market.load(event.params.cToken.toHexString())
  if (market != null) {
    let action = event.params.action
    let pauseState = event.params.pauseState
    if (action ==  'Mint') {
      market.supplyPaused = pauseState
    }
    else if (action == 'Borrow') {
      market.borrowPaused = pauseState
    }
    if (action == 'Flashloan') {
      market.flashloanPaused = pauseState
    }
    market.save()
  }
}

export function handleMarketListed(event: MarketListed): void {
  let comptroller = Comptroller.load('1') as Comptroller

  comptroller.totalMarkets += 1
  comptroller.save()

  // Create the market for this token, since it's now been listed.
  let market = createMarket(event.params.cToken)
  market.save()
}

export function handleMarketDelisted(event: MarketDelisted): void {
  let market = Market.load(event.params.cToken.toHexString())
  if (market != null) {
    market.delisted = true
    market.save()

    let comptroller = Comptroller.load('1') as Comptroller
    comptroller.totalMarkets -= 1
    comptroller.save()
  }
}

export function handleMarketEntered(event: MarketEntered): void {
  let market = Market.load(event.params.cToken.toHexString())
  // Null check needed to avoid crashing on a new market added. Ideally when dynamic data
  // sources can source from the contract creation block and not the time the
  // comptroller adds the market, we can avoid this altogether
  if (market != null) {
    let accountID = event.params.account.toHex()
    let account = Account.load(accountID)
    if (account == null) {
      createAccount(accountID)
    }

    let cTokenStats = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountID,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
    )
    cTokenStats.enteredMarket = true
    cTokenStats.save()
  }
}

export function handleMarketExited(event: MarketExited): void {
  let market = Market.load(event.params.cToken.toHexString())
  // Null check needed to avoid crashing on a new market added. Ideally when dynamic data
  // sources can source from the contract creation block and not the time the
  // comptroller adds the market, we can avoid this altogether
  if (market != null) {
    let accountID = event.params.account.toHex()
    let account = Account.load(accountID)
    if (account == null) {
      createAccount(accountID)
    }

    let cTokenStats = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountID,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
    )
    cTokenStats.enteredMarket = false
    cTokenStats.save()
  }
}

export function handleNewCollateralFactor(event: NewCollateralFactor): void {
  let market = Market.load(event.params.cToken.toHexString())
  // Null check needed to avoid crashing on a new market added. Ideally when dynamic data
  // sources can source from the contract creation block and not the time the
  // comptroller adds the market, we can avoid this altogether
  if (market != null) {
    market.collateralFactor = event.params.newCollateralFactorMantissa
      .toBigDecimal()
      .div(mantissaFactorBD)
    market.save()
  }
}

export function handleNewBorrowCap(event: NewBorrowCap): void {
  let market = Market.load(event.params.cToken.toHexString())
  if (market != null) {
    market.borrowCap = event.params.newBorrowCap.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals)).truncate(market.underlyingDecimals)
    market.save()
  }
}

export function handleNewSupplyCap(event: NewSupplyCap): void {
  let market = Market.load(event.params.cToken.toHexString())
  if (market != null) {
    market.supplyCap = event.params.newSupplyCap.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals)).truncate(market.underlyingDecimals)
    market.save()
  }
}

export function handleCreditLimitChanged(event: CreditLimitChanged): void {
  let borrowerAddress = event.params.protocol.toHexString()
  let marketAddress = event.params.market.toHexString()
  let creditLimitID = borrowerAddress.concat('-').concat(marketAddress)
  let market = Market.load(marketAddress)
  let creditLimit = CreditLimit.load(creditLimitID)
  if (market != null){
    if (creditLimit == null){
      creditLimit = createCreditLimit(event)
    }
    creditLimit.creditLimit = event.params.creditLimit.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals)).truncate(market.underlyingDecimals)
    creditLimit.blockTimestamp = event.block.timestamp.toI32()
    creditLimit.save()
  }
}
