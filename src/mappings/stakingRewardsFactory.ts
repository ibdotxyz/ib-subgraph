/* eslint-disable prefer-const */ // to satisfy AS compiler

import {StakingRewardsCreated} from '../../generated/StakingRewardsFactory/StakingRewardsFactory'
import { Address } from '@graphprotocol/graph-ts'
import { zeroBD} from '../helpers'
import { StakingRewardsFactory, StakingRewards, Market } from '../../generated/schema'
import { StakingRewards as StakingRewardsTemplate } from '../../generated/templates'

function createStakingRewardsFactory(address: Address): StakingRewardsFactory {
    let stakingRewardsFactory = new StakingRewardsFactory(address.toHexString())
    stakingRewardsFactory.address = address
    stakingRewardsFactory.save()
    return stakingRewardsFactory
}

export function handleStakingRewardsCreated(event: StakingRewardsCreated): void {
    let stakingRewardsFactory = StakingRewardsFactory.load(event.address.toHexString())
    if (stakingRewardsFactory == null) {
      stakingRewardsFactory = createStakingRewardsFactory(event.address)
    }
    let market = Market.load(event.params.stakingToken.toHexString()) as Market
    // index the created stakingRewards
    StakingRewardsTemplate.create(event.params.stakingRewards)
    let stakingRewards = new StakingRewards(event.params.stakingRewards.toHexString())
    stakingRewards.factory = stakingRewardsFactory.id
    stakingRewards.address = event.params.stakingRewards
    stakingRewards.market = market.id
    stakingRewards.totalStaked = zeroBD
    stakingRewards.save()
}