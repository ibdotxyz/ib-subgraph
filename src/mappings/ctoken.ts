/* eslint-disable prefer-const */ // to satisfy AS compiler
import {
  AccrueInterest,
  Mint,
  Redeem,
  Borrow,
  RepayBorrow,
  LiquidateBorrow,
  Transfer,
  Flashloan,
  UserCollateralChanged,
  NewReserveFactor,
  NewMarketInterestRateModel,
  NewImplementation,
  NewCollateralCap,
  NewTokenName,
  NewTokenSymbol
} from '../../generated/templates/CToken/CCollateralCapErc20'

import {
  Account,
  AccountCToken,
  CreditLimit,
  Market,
  MintEvent,
  RedeemEvent,
  LiquidationEvent,
  TransferEvent,
  BorrowEvent,
  RepayEvent,
  FlashloanEvent
} from '../../generated/schema'

import { createAccountCToken, createAccount, updateCommonCTokenStats } from './account'
import { cTokenDecimals, cTokenDecimalsBD, exponentToBigDecimal, mantissaFactor, mantissaFactorBD, zeroBD } from '../helpers'
import { ERC20 } from '../../generated/Comptroller/ERC20'
import { Address } from '@graphprotocol/graph-ts'

export function handleAccrueInterest(event: AccrueInterest): void {
  let marketID = event.address.toHexString()
  let blockTimestamp = event.block.timestamp.toI32()

  let market = Market.load(marketID)
  if (market == null){
    return
  }
  market.blockTimestamp = blockTimestamp

  market.cash = event.params.cashPrior
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  market.totalBorrows = event.params.totalBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)
  if (market.underlyingSymbol == '') {
    let underlyingContract = ERC20.bind(market.underlyingAddress as Address)
    market.underlyingSymbol = underlyingContract.symbol()
    market.underlyingName = underlyingContract.name()
    market.underlyingDecimals = underlyingContract.decimals()
  }
  market.save()
}

/* Account supplies assets into market and receives cTokens in exchange
 *
 * event.mintAmount is the underlying asset
 * event.mintTokens is the amount of cTokens minted
 * event.minter is the account
 *
 * Notes
 *    Transfer event will always get emitted with this
 *    Mints originate from the cToken address, not 0x000000, which is typical of ERC-20s
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    No need to updateCommonCTokenStats, handleTransfer() will
 *    No need to update cTokenBalance, handleTransfer() will
 */
export function handleMint(event: Mint): void {
  let market = Market.load(event.address.toHexString()) as Market
  let mintID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let cTokenAmount = event.params.mintTokens
    .toBigDecimal()
    .div(cTokenDecimalsBD)
    .truncate(cTokenDecimals)
  let underlyingAmount = event.params.mintAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  if (cTokenAmount.gt(zeroBD)) {
    market.exchangeRate = underlyingAmount.div(cTokenAmount).truncate(mantissaFactor)
    market.totalSupply = market.totalSupply.plus(cTokenAmount)
    market.cash = market.cash.plus(underlyingAmount)
    market.save()
  }

  let mint = new MintEvent(mintID)
  mint.amount = cTokenAmount
  mint.minter = event.params.minter
  mint.cToken = event.address
  mint.blockNumber = event.block.number.toI32()
  mint.blockTime = event.block.timestamp.toI32()
  mint.cTokenSymbol = market.symbol
  mint.underlyingAmount = underlyingAmount
  mint.save()
}

/*  Account supplies cTokens into market and receives underlying asset in exchange
 *
 *  event.redeemAmount is the underlying asset
 *  event.redeemTokens is the cTokens
 *  event.redeemer is the account
 *
 *  Notes
 *    Transfer event will always get emitted with this
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    No need to updateCommonCTokenStats, handleTransfer() will
 *    No need to update cTokenBalance, handleTransfer() will
 */
export function handleRedeem(event: Redeem): void {
  let market = Market.load(event.address.toHexString()) as Market
  let redeemID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let cTokenAmount = event.params.redeemTokens
    .toBigDecimal()
    .div(cTokenDecimalsBD)
    .truncate(cTokenDecimals)
  let underlyingAmount = event.params.redeemAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  if (cTokenAmount.gt(zeroBD)) {
    market.exchangeRate = underlyingAmount.div(cTokenAmount).truncate(mantissaFactor)
    market.totalSupply = market.totalSupply.minus(cTokenAmount)
    market.cash = market.cash.minus(underlyingAmount)
    market.save()
  }

  let redeem = new RedeemEvent(redeemID)
  redeem.amount = cTokenAmount
  redeem.cToken = event.address
  redeem.redeemer = event.params.redeemer
  redeem.blockNumber = event.block.number.toI32()
  redeem.blockTime = event.block.timestamp.toI32()
  redeem.cTokenSymbol = market.symbol
  redeem.underlyingAmount = underlyingAmount
  redeem.save()
}

/* Borrow assets from the protocol.
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account
 * event.params.borrowAmount = that was added in this event
 * event.params.borrower = the account
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    Update creditBorrow in CreditLimit entity if borrower has credit limit
 */
export function handleBorrow(event: Borrow): void {
  let marketAddress = event.address.toHexString()
  let market = Market.load(marketAddress) as Market
  let accountID = event.params.borrower.toHex()
  let account = Account.load(accountID)
  if (account == null) {
    account = createAccount(accountID)
  }
  account.save()

  let borrowAmountBD = event.params.borrowAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))

  market.totalBorrows = event.params.totalBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)
  market.cash = market.cash.minus(borrowAmountBD)
  market.save()

  // Update cTokenStats common for all events, and return the stats to update unique
  // values for each event
  let cTokenStats = updateCommonCTokenStats(
    market.id,
    market.symbol,
    accountID,
    event.transaction.hash,
    event.block.timestamp,
    event.block.number,
    event.logIndex,
  )

  cTokenStats.storedBorrowBalance = event.params.accountBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  cTokenStats.blockTimestamp = event.block.timestamp.toI32()
  cTokenStats.save()

  let borrowID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let borrowAmount = event.params.borrowAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  let accountBorrows = event.params.accountBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  let borrow = new BorrowEvent(borrowID)
  borrow.amount = borrowAmount
  borrow.accountBorrows = accountBorrows
  borrow.borrower = event.params.borrower
  borrow.blockNumber = event.block.number.toI32()
  borrow.blockTime = event.block.timestamp.toI32()
  borrow.underlyingSymbol = market.underlyingSymbol
  borrow.cToken = event.address
  borrow.save()

  // keep track of credit limit data if borrower is a credit limit account
  let creditLimitID = event.params.borrower.toHexString().concat('-').concat(marketAddress)
  let creditLimit = CreditLimit.load(creditLimitID)
  if (creditLimit != null){
    creditLimit.creditBorrow = accountBorrows
    creditLimit.blockTimestamp = event.block.timestamp.toI32()
    creditLimit.save()
  }
}

/* Repay some amount borrowed. Anyone can repay anyones balance
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account (not used right now)
 * event.params.repayAmount = that was added in this event
 * event.params.borrower = the borrower
 * event.params.payer = the payer
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    Once a account totally repays a borrow, it still has its account interest index set to the
 *    markets value. We keep this, even though you might think it would reset to 0 upon full
 *    repay.
 *    Update creditBorrow in CreditLimit entity if borrower has credit limit
 */
export function handleRepayBorrow(event: RepayBorrow): void {
  let marketAddress = event.address.toHexString()
  let market = Market.load(marketAddress) as Market
  let accountID = event.params.borrower.toHex()
  let account = Account.load(accountID)
  if (account == null) {
    createAccount(accountID)
  }

  let repayAmountBD = event.params.repayAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))

  market.totalBorrows = event.params.totalBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)
  market.cash = market.cash.plus(repayAmountBD)
  market.save()

  // Update cTokenStats common for all events, and return the stats to update unique
  // values for each event
  let cTokenStats = updateCommonCTokenStats(
    market.id,
    market.symbol,
    accountID,
    event.transaction.hash,
    event.block.timestamp,
    event.block.number,
    event.logIndex,
  )

  cTokenStats.storedBorrowBalance = event.params.accountBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  cTokenStats.blockTimestamp = event.block.timestamp.toI32()
  cTokenStats.save()

  let repayID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let repayAmount = event.params.repayAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  let accountBorrows = event.params.accountBorrows
    .toBigDecimal()
    .div(exponentToBigDecimal(market.underlyingDecimals))
    .truncate(market.underlyingDecimals)

  let repay = new RepayEvent(repayID)
  repay.amount = repayAmount
  repay.accountBorrows = accountBorrows
  repay.borrower = event.params.borrower
  repay.blockNumber = event.block.number.toI32()
  repay.blockTime = event.block.timestamp.toI32()
  repay.underlyingSymbol = market.underlyingSymbol
  repay.payer = event.params.payer
  repay.cToken = event.address
  repay.save()

  // keep track of credit limit data if borrower is a credit limit account
  let creditLimitID = event.params.borrower.toHexString().concat('-').concat(marketAddress)
  let creditLimit = CreditLimit.load(creditLimitID)
  if (creditLimit != null){
    creditLimit.creditBorrow = accountBorrows
    creditLimit.blockTimestamp = event.block.timestamp.toI32()
    creditLimit.save()
  }
}

export function handleLiquidateBorrow(event: LiquidateBorrow): void {
  // For a liquidation, the liquidator pays down the borrow of the underlying
  // asset. They seize one of potentially many types of cToken collateral of
  // the underwater borrower. So we must get that address from the event, and
  // the repay token is the event.address
  let marketRepayToken = Market.load(event.address.toHexString()) as Market
  let marketCTokenLiquidated = Market.load(event.params.cTokenCollateral.toHexString())
  if (marketCTokenLiquidated == null) {
    return
  }

  let borrowerID = event.params.borrower.toHexString()
  let borrowCTokenStatsID = marketRepayToken.id.concat('-').concat(borrowerID)
  let borrowCToken = AccountCToken.load(borrowCTokenStatsID) as AccountCToken

  let seizeCTokenStatsID = marketCTokenLiquidated.id.concat('-').concat(borrowerID)
  let seizeCToken = AccountCToken.load(seizeCTokenStatsID)
  if (seizeCToken == null) {
    seizeCToken = createAccountCToken(seizeCTokenStatsID, marketCTokenLiquidated.symbol, borrowerID, marketCTokenLiquidated.id)
  }
  let liquidateID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let cTokenAmount = event.params.seizeTokens
    .toBigDecimal()
    .div(cTokenDecimalsBD)
    .truncate(cTokenDecimals)
  let underlyingRepayAmount = event.params.repayAmount
    .toBigDecimal()
    .div(exponentToBigDecimal(marketRepayToken.underlyingDecimals))
    .truncate(marketRepayToken.underlyingDecimals)

  let liquidation = new LiquidationEvent(liquidateID)
  liquidation.blockNumber = event.block.number.toI32()
  liquidation.blockTime = event.block.timestamp.toI32()
  liquidation.liquidator = event.params.liquidator
  liquidation.borrower = event.params.borrower
  liquidation.seizeAmount = cTokenAmount
  liquidation.cToken = event.address
  liquidation.seizeCToken = event.params.cTokenCollateral
  liquidation.underlyingRepayAmount = underlyingRepayAmount
  liquidation.underlyingSeizeAmount = marketCTokenLiquidated.exchangeRate.times(cTokenAmount)
  liquidation.borrowerRemainingUnderlyingCollateral = marketCTokenLiquidated.exchangeRate.times(seizeCToken.cTokenBalance)
  liquidation.borrowerRemainingBorrowBalance = borrowCToken.storedBorrowBalance
  liquidation.save()
}

/* Transferring of cTokens
 *
 * event.params.from = sender of cTokens
 * event.params.to = receiver of cTokens
 * event.params.amount = amount sent
 *
 * Notes
 *    Possible ways to emit Transfer:
 *      seize() - i.e. a Liquidation Transfer (does not emit anything else)
 *      redeemFresh() - i.e. redeeming your cTokens for underlying asset
 *      mintFresh() - i.e. you are lending underlying assets to create ctokens
 *      transfer() - i.e. a basic transfer
 *    This function handles all 4 cases. Transfer is emitted alongside the mint, redeem, and seize
 *    events. So for those events, we do not update cToken balances.
 */
export function handleTransfer(event: Transfer): void {
  // We don't updateMarket with normal transfers,
  // since mint, redeem, and seize transfers will already run updateMarket()
  let marketID = event.address.toHexString()
  let market = Market.load(marketID) as Market

  let amountUnderlying = market.exchangeRate.times(
    event.params.amount.toBigDecimal().div(cTokenDecimalsBD),
  )

  // Checking if the tx is FROM the cToken contract (i.e. this will not run when minting)
  // If so, it is a mint, and we don't need to run these calculations
  let accountFromID = event.params.from.toHex()
  if (accountFromID != marketID) {
    let accountFrom = Account.load(accountFromID)
    if (accountFrom == null) {
      createAccount(accountFromID)
    }

    // Update cTokenStats common for all events, and return the stats to update unique
    // values for each event
    let cTokenStatsFrom = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountFromID,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
    )

    cTokenStatsFrom.cTokenBalance = cTokenStatsFrom.cTokenBalance.minus(
      event.params.amount
        .toBigDecimal()
        .div(cTokenDecimalsBD)
        .truncate(cTokenDecimals),
    )

    cTokenStatsFrom.save()
  }

  // Checking if the tx is TO the cToken contract (i.e. this will not run when redeeming)
  // If so, we ignore it. this leaves an edge case, where someone who accidentally sends
  // cTokens to a cToken contract, where it will not get recorded. Right now it would
  // be messy to include, so we are leaving it out for now TODO fix this in future
  let accountToID = event.params.to.toHex()
  if (accountToID != marketID) {
    let accountTo = Account.load(accountToID)
    if (accountTo == null) {
      createAccount(accountToID)
    }

    // Update cTokenStats common for all events, and return the stats to update unique
    // values for each event
    let cTokenStatsTo = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountToID,
      event.transaction.hash,
      event.block.timestamp,
      event.block.number,
      event.logIndex,
    )

    cTokenStatsTo.cTokenBalance = cTokenStatsTo.cTokenBalance.plus(
      event.params.amount
        .toBigDecimal()
        .div(cTokenDecimalsBD)
        .truncate(cTokenDecimals),
    )

    cTokenStatsTo.save()
  }

  let transferID = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.transactionLogIndex.toString())

  let transfer = new TransferEvent(transferID)
  transfer.amount = event.params.amount.toBigDecimal().div(cTokenDecimalsBD)
  transfer.to = event.params.to
  transfer.from = event.params.from
  transfer.blockNumber = event.block.number.toI32()
  transfer.blockTime = event.block.timestamp.toI32()
  transfer.cTokenSymbol = market.symbol
  transfer.save()
}

export function handleFlashloan(event: Flashloan): void {
  let flashloanID = event.transaction.hash.toHexString().concat('-').concat(event.transactionLogIndex.toString())
  let flashloanEvent = new FlashloanEvent(flashloanID)
  let marketID = event.address.toHexString()
  let market = Market.load(marketID) as Market

  flashloanEvent.blockNumber = event.block.number.toI32()
  flashloanEvent.blockTime = event.block.timestamp.toI32()
  flashloanEvent.receiver = event.params.receiver
  flashloanEvent.market = marketID
  flashloanEvent.amount = event.params.amount.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals)).truncate(market.underlyingDecimals)
  flashloanEvent.totalFee = event.params.totalFee.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals)).truncate(market.underlyingDecimals)
  flashloanEvent.reservesFee = event.params.reservesFee.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals)).truncate(market.underlyingDecimals)
  flashloanEvent.save()
}

export function handleUserCollateralChanged(event: UserCollateralChanged): void {
  let marketID = event.address.toHexString()
  let market = Market.load(marketID) as Market

  let accountID = event.params.account.toHexString()
  let accountCTokenID = market.id.concat('-').concat(accountID)
  let accountCToken = AccountCToken.load(accountCTokenID)
  if (accountCToken == null) {
    accountCToken = createAccountCToken(accountCTokenID, market.symbol, accountID, marketID)
  }
  
  let newCollateralTokens = event.params.newCollateralTokens.toBigDecimal().div(exponentToBigDecimal(market.underlyingDecimals)).truncate(market.underlyingDecimals)
  let diff = newCollateralTokens.minus(accountCToken.cTokenCollateralBalance)

  accountCToken.cTokenCollateralBalance = newCollateralTokens
  accountCToken.save()
  market.totalCollateralTokens = market.totalCollateralTokens.plus(diff)
  market.save()
}

export function handleNewReserveFactor(event: NewReserveFactor): void {
  let marketID = event.address.toHex()
  let market = Market.load(marketID) as Market
  market.reserveFactor = event.params.newReserveFactorMantissa.toBigDecimal().div(mantissaFactorBD).truncate(mantissaFactor)
  market.save()
}

export function handleNewMarketInterestRateModel(
  event: NewMarketInterestRateModel,
): void {
  let marketID = event.address.toHex()
  let market = Market.load(marketID) as Market
  market.interestRateModelAddress = event.params.newInterestRateModel
  market.save()
}

export function handleNewImplementation(event: NewImplementation): void {
  let marketID = event.address.toHex()
  let market = Market.load(marketID) as Market
  market.implementation = event.params.newImplementation
  market.save()
}

export function handleNewCollateralCap(event: NewCollateralCap): void {
  let marketID = event.address.toHex()
  let market = Market.load(marketID) as Market
  market.collateralCap = event.params.newCap.toBigDecimal().div(exponentToBigDecimal(market.decimals)).truncate(market.decimals)
  market.save()
}

export function handleNewTokenName(event: NewTokenName): void {
  let marketID = event.address.toHex()
  let market = Market.load(marketID) as Market
  market.name = event.params.newTokenName
  market.save()
}

export function handleNewTokenSymbol(event: NewTokenSymbol): void {
  let marketID = event.address.toHex()
  let market = Market.load(marketID) as Market
  market.symbol = event.params.newTokenSymbol
  market.save()
}
