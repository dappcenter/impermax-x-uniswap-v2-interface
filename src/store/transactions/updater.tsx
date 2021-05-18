
import * as React from 'react';
import {
  useDispatch,
  useSelector
} from 'react-redux';
import useInterval from 'use-interval';
import { useWeb3React } from '@web3-react/core';
import {
  Web3Provider,
  TransactionReceipt
} from '@ethersproject/providers';

import {
  AppDispatch,
  AppState
} from '../index';
import {
  checkedTransaction,
  finalizeTransaction
} from './actions';

function shouldCheck(
  blockNumber: number,
  tx: {
    addedTime: number;
    receipt?: unknown; // TODO: should type properly
    lastCheckedBlockNumber?: number
  }
): boolean {
  if (tx.receipt) return false;
  if (!tx.lastCheckedBlockNumber) return true;
  const blocksSinceCheck = blockNumber - tx.lastCheckedBlockNumber;
  if (blocksSinceCheck < 1) return false;
  const minutesPending = (new Date().getTime() - tx.addedTime) / 1000 / 60;
  // every 10 blocks if pending for longer than an hour
  if (minutesPending > 60) {
    return blocksSinceCheck > 9;
  // every 3 blocks if pending more than 5 minutes
  } else if (minutesPending > 5) {
    return blocksSinceCheck > 2;
  // otherwise every block
  } else {
    return true;
  }
}

// TODO: should be a custom hook instead of a component
const Updater = (): null => {
  const {
    library,
    chainId = 0
  } = useWeb3React<Web3Provider>();

  const dispatch = useDispatch<AppDispatch>();
  const state = useSelector<AppState, AppState['transactions']>(state => state.transactions);

  const transactions = state[chainId];

  const [blockNumber, setBlockNumber] = React.useState<number>();
  useInterval(async () => {
    if (!library) return;

    try {
      const theBlockNumber = await library.getBlockNumber();

      setBlockNumber(theBlockNumber);
    } catch (error) {
      console.log('[Updater useInterval] error.message => ', error.message);
    }
  }, 3000);

  React.useEffect(() => {
    if (!library) return;
    if (!chainId) return;
    if (!blockNumber) return;
    if (!transactions) return;

    Object.keys(transactions)
      .filter(hash => shouldCheck(blockNumber, transactions[hash]))
      .forEach(hash => {
        library
          .getTransactionReceipt(hash)
          .then((receipt: TransactionReceipt) => {
            if (receipt) {
              dispatch(
                finalizeTransaction({
                  chainId,
                  hash,
                  receipt: {
                    blockHash: receipt.blockHash,
                    blockNumber: receipt.blockNumber,
                    contractAddress: receipt.contractAddress,
                    from: receipt.from,
                    status: receipt.status,
                    to: receipt.to,
                    transactionHash: receipt.transactionHash,
                    transactionIndex: receipt.transactionIndex
                  }
                })
              );
            } else {
              dispatch(checkedTransaction({
                chainId,
                hash,
                blockNumber: blockNumber
              }));
            }
          })
          .catch((error: Error) => {
            console.error(`Failed to check transaction hash: ${hash} error.message => `, error.message);
          });
      });
  }, [
    library,
    chainId,
    transactions,
    blockNumber,
    dispatch
  ]);

  return null;
};

export {
  shouldCheck
};

export default Updater;
