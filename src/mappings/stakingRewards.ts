/* eslint-disable prefer-const */ // to satisfy AS compiler

import { Staked, Withdrawn, RewardPaid} from '../../generated/StakingRewardsFactory/StakingRewards'
import { ERC20 } from '../../generated/templates/CToken/ERC20'
import { Address } from '@graphprotocol/graph-ts'
import { StakingRewardsUserReward, StakingRewards, StakingRewardsUser } from '../../generated/schema'
import { cTokenDecimals,cTokenDecimalsBD,exponentToBigDecimal, zeroBD} from '../helpers'

function getStakingRewardsUser(stakingRewards:StakingRewards, userAddress:Address):StakingRewardsUser{
    let stakingRewardsUserId = stakingRewards.address.toHexString().concat('-').concat(userAddress.toHexString())
    let stakingRewardsUser = StakingRewardsUser.load(stakingRewardsUserId)

    if (stakingRewardsUser == null) {
        stakingRewardsUser = new StakingRewardsUser(stakingRewardsUserId)
        stakingRewardsUser.user = userAddress
        stakingRewardsUser.stakingRewards = stakingRewards.id    
        stakingRewardsUser.stakedBalance = zeroBD
    }
    return stakingRewardsUser
}

export function handleStaked(event: Staked): void {
    let stakingRewards = StakingRewards.load(event.address.toHexString()) as StakingRewards    
    let stakingRewardsUser = getStakingRewardsUser(stakingRewards, event.params.user)
    let stakedAmount = event.params.amount.toBigDecimal().div(cTokenDecimalsBD).truncate(cTokenDecimals)
    stakingRewardsUser.stakedBalance = stakingRewardsUser.stakedBalance.plus(stakedAmount)
    stakingRewards.totalStaked = stakingRewards.totalStaked.plus(stakedAmount)
    stakingRewards.save()
    stakingRewardsUser.save()
}

export function handleWithdrawal(event: Withdrawn): void {
    let stakingRewards = StakingRewards.load(event.address.toHexString()) as StakingRewards    
    let stakingRewardsUser = getStakingRewardsUser(stakingRewards, event.params.user)
    let withdrawnAmount = event.params.amount.toBigDecimal().div(cTokenDecimalsBD).truncate(cTokenDecimals)
    stakingRewardsUser.stakedBalance = stakingRewardsUser.stakedBalance.minus(withdrawnAmount)
    stakingRewards.totalStaked = stakingRewards.totalStaked.minus(withdrawnAmount)
    stakingRewards.save()
    stakingRewardsUser.save()
}


export function handleRewardsPaid(event: RewardPaid): void {
    let stakingRewards = StakingRewards.load(event.address.toHexString()) as StakingRewards    
    let stakingRewardsUser = getStakingRewardsUser(stakingRewards, event.params.user)
    let stakingRewardsUserRewardsId = stakingRewardsUser.id.concat("-").concat(event.params.rewardsToken.toHexString())
    let stakingRewardsUserReward = StakingRewardsUserReward.load(stakingRewardsUserRewardsId)
    if (stakingRewardsUserReward==null){
        stakingRewardsUserReward = new StakingRewardsUserReward(stakingRewardsUserRewardsId)
        stakingRewardsUserReward.stakingRewardsUser = stakingRewardsUser.id
        stakingRewardsUserReward.rewardsToken = event.params.rewardsToken
        stakingRewardsUserReward.totalRewardsClaimed = zeroBD
    }
    let rewardTokenContract = ERC20.bind(event.params.rewardsToken)
    let rewardTokenDecimals = rewardTokenContract.decimals()
    let rewardTokenDecimalsBD = exponentToBigDecimal(rewardTokenDecimals)
    stakingRewardsUserReward.totalRewardsClaimed = stakingRewardsUserReward.totalRewardsClaimed.plus(event.params.reward.toBigDecimal().div(rewardTokenDecimalsBD).truncate(rewardTokenDecimals))
    stakingRewardsUserReward.save()
}
