
import * as React from 'react';
import { usePromise } from 'react-use';
import { useWeb3React } from '@web3-react/core';
import { Web3Provider } from '@ethersproject/providers';
import gql from 'graphql-tag';
import { useMedia } from 'react-use';
import {
  useErrorHandler,
  withErrorBoundary
} from 'react-error-boundary';

import LendingPoolListItem from './LendingPoolListItem';
import LendingPoolListHeader from './LendingPoolListHeader';
import ErrorFallback from 'components/ErrorFallback';
import LineLoadingSpinner from 'components/LineLoadingSpinner';
import { IMPERMAX_SUBGRAPH_URLS } from 'config/web3/subgraphs';
import { W_ETH_ADDRESSES } from 'config/web3/contracts/w-eths';
import { IMX_ADDRESSES } from 'config/web3/contracts/imxes';
import { UNISWAP_V2_FACTORY_ADDRESSES } from 'config/web3/contracts/uniswap-v2-factories';
import getPairAddress from 'utils/helpers/web3/get-pair-address';
import { BREAKPOINTS } from 'utils/constants/styles';
import STATUSES from 'utils/constants/statuses';
import getUniswapAPYs from 'services/get-uniswap-apys';
import apolloFetcher from 'services/apollo-fetcher';
import { LendingPoolData } from 'types/interfaces';

const borrowableStr = `{
  id
  underlying {
    id
    symbol
    name
    decimals
    derivedUSD
  }
  totalBalance
  totalBorrows
  borrowRate
  reserveFactor
  kinkBorrowRate
  kinkUtilizationRate
  borrowIndex
  accrualTimestamp 
  exchangeRate 
  totalBalanceUSD
  totalSupplyUSD
  totalBorrowsUSD
  farmingPool {
    epochAmount
    epochBegin
    segmentLength
    vestingBegin
    sharePercentage
    distributor {
      id
    }
  }
}`;

const query = gql`{
  lendingPools(first: 1000, orderBy: totalBorrowsUSD, orderDirection: desc) {
    id
    borrowable0 ${borrowableStr}
    borrowable1 ${borrowableStr}
    collateral {
      id
      totalBalance
      totalBalanceUSD
      safetyMargin
      liquidationIncentive
      exchangeRate 
    }
    pair {
      reserve0
      reserve1
      reserveUSD
      token0Price
      token1Price
      derivedUSD
    }
  }
}`;

const LendingPoolList = (): JSX.Element | null => {
  const { chainId } = useWeb3React<Web3Provider>();

  const greaterThanMd = useMedia(`(min-width: ${BREAKPOINTS.md})`);

  const [lendingPools, setLendingPools] = React.useState<Array<LendingPoolData>>();
  const [status, setStatus] = React.useState(STATUSES.IDLE);

  const handleError = useErrorHandler();

  const mounted = usePromise();

  // ray test touch <<
  React.useEffect(() => {
    if (!chainId) return;
    if (!handleError) return;
    if (!mounted) return;
    /**
     * TODO:
     * - https://stackoverflow.com/questions/53949393/cant-perform-a-react-state-update-on-an-unmounted-component
     * - https://github.com/streamich/react-use/blob/master/src/useAsyncFn.ts
     */
    (async () => {
      try {
        setStatus(STATUSES.PENDING);
        const impermaxSubgraphURL = IMPERMAX_SUBGRAPH_URLS[chainId];
        const result = await mounted(apolloFetcher(impermaxSubgraphURL, query));
        const initialLendingPools: Array<LendingPoolData> = result.data.lendingPools;

        const uniswapV2PairAddresses = initialLendingPools.map(
          (initialLendingPool: { id: string; }) => initialLendingPool.id
        );
        const uniswapAPYs = await mounted(getUniswapAPYs(uniswapV2PairAddresses));

        const theLendingPools = initialLendingPools.map(initialLendingPool => ({
          ...initialLendingPool,
          pair: {
            ...initialLendingPool.pair,
            uniswapAPY: uniswapAPYs[initialLendingPool.id]
          }
        }));
        setLendingPools(theLendingPools);
        setStatus(STATUSES.RESOLVED);
      } catch (error) {
        setStatus(STATUSES.REJECTED);
        handleError(error);
      }
    })();
  }, [
    chainId,
    handleError,
    mounted
  ]);
  // ray test touch >>

  if (status === STATUSES.IDLE || status === STATUSES.PENDING) {
    return (
      <LineLoadingSpinner />
    );
  }

  if (status === STATUSES.RESOLVED) {
    if (!lendingPools) {
      throw new Error('Invalid lendingPools!');
    }
    if (!chainId) {
      throw new Error('Invalid chain ID!');
    }

    const imxAddress = IMX_ADDRESSES[chainId];
    const wethAddress = W_ETH_ADDRESSES[chainId];
    const uniswapV2FactoryAddress = UNISWAP_V2_FACTORY_ADDRESSES[chainId];
    const imxPair = getPairAddress(wethAddress, imxAddress, uniswapV2FactoryAddress).toLowerCase();
    const imxLendingPool = lendingPools.find(lendingPool => lendingPool.id === imxPair);

    if (!imxLendingPool) {
      throw new Error('Something went wrong!');
    }

    return (
      <div className='space-y-3'>
        {greaterThanMd && (
          <LendingPoolListHeader className='px-4' />
        )}
        {lendingPools.map(lendingPool => {
          return (
            <LendingPoolListItem
              key={lendingPool.id}
              chainID={chainId}
              imxLendingPool={imxLendingPool}
              lendingPool={lendingPool}
              greaterThanMd={greaterThanMd} />
          );
        })}
      </div>
    );
  }

  return null;
};

export default withErrorBoundary(LendingPoolList, {
  FallbackComponent: ErrorFallback,
  onReset: () => {
    window.location.reload();
  }
});
