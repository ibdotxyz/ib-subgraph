/* eslint-disable prefer-const */ // to satisfy AS compiler

import { Staked, Withdrawn, RewardPaid} from '../../generated/StakingRewardsFactory/StakingRewards'
import { ERC20 } from '../../generated/templates/CToken/ERC20'
import { Address, BigInt } from '@graphprotocol/graph-ts'
import { StakingRewardsAccountAction, StakingRewards, Account, Market } from '../../generated/schema'
import { cTokenDecimals,cTokenDecimalsBD,exponentToBigDecimal, zeroBD} from '../helpers'
import { createAccount } from "./account"


enum StakingRewardsAccountActionType {
    Stake,
    Withdraw,
    ClaimReward,
}


function getAccount(address:Address): Account {
    let account = Account.load(address.toHex())
    if (account == null) {
        account = createAccount(address.toHex())
    }
    return account
}
function getStakingRewardsAccountAction(stakingRewards:StakingRewards, account:Account, transactionHash:string, logIndex:string, blockTimestamp: BigInt):StakingRewardsAccountAction {
    let stakingRewardsAccountActionId = transactionHash.concat("-").concat(logIndex)
    let stakingRewardsAccountAction =  new StakingRewardsAccountAction(stakingRewardsAccountActionId)
    stakingRewardsAccountAction.account = account.id
    stakingRewardsAccountAction.stakingRewards = stakingRewards.id
    stakingRewardsAccountAction.blockTimestamp = blockTimestamp.toI32()
    return stakingRewardsAccountAction
}
export function handleStaked(event: Staked): void {
    let stakingRewards = StakingRewards.load(event.address.toHexString()) as StakingRewards    
    let account = getAccount(event.params.user)
    let stakingRewardsAccountAction = getStakingRewardsAccountAction(stakingRewards, account, event.transaction.hash.toHexString(), event.logIndex.toString(), event.block.timestamp)
    let market = Market.load(stakingRewards.market) as Market

    let stakedUnderlyingAmount = market.exchangeRate.times(
        event.params.amount.toBigDecimal().div(cTokenDecimalsBD),
      )

    stakingRewardsAccountAction.type = StakingRewardsAccountActionType.Stake
    stakingRewardsAccountAction.amount = stakedUnderlyingAmount
    stakingRewardsAccountAction.token = stakingRewards.market
    

    stakingRewards.totalStaked = stakingRewards.totalStaked.plus(stakedUnderlyingAmount)
    stakingRewards.save()
    stakingRewardsAccountAction.save()
}

export function handleWithdrawal(event: Withdrawn): void {
    let stakingRewards = StakingRewards.load(event.address.toHexString()) as StakingRewards    
    let account = getAccount(event.params.user)
    let stakingRewardsAccountAction = getStakingRewardsAccountAction(stakingRewards, account, event.transaction.hash.toHexString(), event.logIndex.toString(), event.block.timestamp)
    let market = Market.load(stakingRewards.market) as Market

    let withdrawnUnderlyingAmount = market.exchangeRate.times(
        event.params.amount.toBigDecimal().div(cTokenDecimalsBD),
      )
        
    stakingRewardsAccountAction.type = StakingRewardsAccountActionType.Withdraw
    stakingRewardsAccountAction.amount = withdrawnUnderlyingAmount
    stakingRewardsAccountAction.token = stakingRewards.market

    stakingRewards.totalStaked = stakingRewards.totalStaked.minus(withdrawnUnderlyingAmount)
    stakingRewards.save()
    stakingRewardsAccountAction.save()
}


export function handleRewardsPaid(event: RewardPaid): void {
    let stakingRewards = StakingRewards.load(event.address.toHexString()) as StakingRewards    
    let account = getAccount(event.params.user)
    let stakingRewardsAccountAction = getStakingRewardsAccountAction(stakingRewards, account, event.transaction.hash.toHexString(), event.logIndex.toString(), event.block.timestamp)

    let rewardTokenContract = ERC20.bind(event.params.rewardsToken)
    let rewardTokenDecimals = rewardTokenContract.decimals()
    let rewardTokenDecimalsBD = exponentToBigDecimal(rewardTokenDecimals)
    let claimedAmount = event.params.reward.toBigDecimal().div(rewardTokenDecimalsBD).truncate(rewardTokenDecimals)

    stakingRewardsAccountAction.type = StakingRewardsAccountActionType.ClaimReward
    stakingRewardsAccountAction.amount = claimedAmount
    stakingRewardsAccountAction.token = event.params.rewardsToken.toHexString()

    stakingRewardsAccountAction.save()
}
