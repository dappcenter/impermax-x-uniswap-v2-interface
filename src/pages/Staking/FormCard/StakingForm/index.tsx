
import * as React from 'react';
import { useForm } from 'react-hook-form';
import {
  useQuery,
  useMutation
} from 'react-query';
import {
  useErrorHandler,
  withErrorBoundary
} from 'react-error-boundary';
import { usePromise } from 'react-use';
import { useWeb3React } from '@web3-react/core';
import { Web3Provider } from '@ethersproject/providers';
import {
  formatUnits,
  parseUnits
} from '@ethersproject/units';
import {
  Zero
  // MaxUint256
} from '@ethersproject/constants';
import { BigNumber } from '@ethersproject/bignumber';
import {
  Contract,
  ContractTransaction,
  ContractReceipt
} from '@ethersproject/contracts';
import clsx from 'clsx';

import TokenAmountLabel from '../TokenAmountLabel';
import TokenAmountField from '../TokenAmountField';
import SubmitButton from '../SubmitButton';
import WalletConnectButton from 'containers/WalletConnectButton';
import ErrorFallback from 'components/ErrorFallback';
import ErrorModal from 'components/ErrorModal';
import { IMX_ADDRESSES } from 'config/web3/contracts/imxes';
import { STAKING_ROUTER_ADDRESSES } from 'config/web3/contracts/staking-routers';
import useTokenBalance from 'utils/hooks/web3/use-token-balance';
import getERC20Contract from 'utils/helpers/web3/get-erc20-contract';
import formatNumberWithFixedDecimals from 'utils/helpers/format-number-with-fixed-decimals';
import genericFetcher, { GENERIC_FETCHER } from 'services/fetchers/generic-fetcher';
import ERC20JSON from 'abis/contracts/IERC20.json';
import StakingRouterJSON from 'abis/contracts/IStakingRouter.json';
import { useTransactionAdder } from 'store/transactions/hooks';

const getStakingRouterContract = (chainID: number, library: Web3Provider, account: string) => {
  const stakingRouterAddress = STAKING_ROUTER_ADDRESSES[chainID];
  const signer = library.getSigner(account);

  return new Contract(stakingRouterAddress, StakingRouterJSON.abi, signer);
};

const STAKING_AMOUNT = 'staking-amount';

type StakingFormData = {
  [STAKING_AMOUNT]: string;
}

const StakingForm = (props: React.ComponentPropsWithRef<'form'>): JSX.Element => {
  const {
    chainId,
    account,
    library,
    active
  } = useWeb3React<Web3Provider>();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<StakingFormData>({
    mode: 'onChange'
  });

  const tokenAddress = chainId ? IMX_ADDRESSES[chainId] : undefined;
  const {
    isIdle: imxBalanceIdle,
    isLoading: imxBalanceLoading,
    isSuccess: imxBalanceSuccess,
    data: imxBalance,
    error: imxBalanceError,
    refetch: imxBalanceRefetch
  } = useTokenBalance(
    chainId,
    library,
    tokenAddress,
    account
  );
  useErrorHandler(imxBalanceError);

  const owner = account;
  const spender = chainId ? STAKING_ROUTER_ADDRESSES[chainId] : undefined;
  const {
    isIdle: imxAllowanceIdle,
    isLoading: imxAllowanceLoading,
    isSuccess: imxAllowanceSuccess,
    data: imxAllowance,
    error: imxAllowanceError,
    refetch: imxAllowanceRefetch
  } = useQuery<BigNumber, Error>(
    [
      GENERIC_FETCHER,
      chainId,
      tokenAddress,
      'allowance',
      owner,
      spender
    ],
    (chainId && library && tokenAddress && owner && spender) ?
      genericFetcher<BigNumber>(library, ERC20JSON.abi) :
      Promise.resolve,
    {
      enabled: !!(chainId && library && tokenAddress && owner && spender)
    }
  );
  useErrorHandler(imxAllowanceError);

  const approveMutation = useMutation<ContractReceipt, Error, string>(
    async (variables: string) => {
      if (!chainId) {
        throw new Error('Invalid chain ID!');
      }
      if (!library) {
        throw new Error('Invalid library!');
      }
      if (!account) {
        throw new Error('Invalid account!');
      }

      const bigStakingAmount = parseUnits(variables);
      const imxContract = getERC20Contract(IMX_ADDRESSES[chainId], library, account);
      const spender = STAKING_ROUTER_ADDRESSES[chainId];
      // MEMO: `bigStakingAmount` instead of `MaxUint256`
      const tx: ContractTransaction = await imxContract.approve(spender, bigStakingAmount);
      return await tx.wait();
    },
    {
      onSuccess: (data, variables) => {
        addTransaction({
          hash: data.transactionHash
        }, {
          summary: `Approve of IMX (${variables}) transfer.`
        });
        imxAllowanceRefetch();
      }
    }
  );

  const stakeMutation = useMutation<ContractReceipt, Error, string>(
    async (variables: string) => {
      if (!chainId) {
        throw new Error('Invalid chain ID!');
      }
      if (!library) {
        throw new Error('Invalid library!');
      }
      if (!account) {
        throw new Error('Invalid account!');
      }

      const bigStakingAmount = parseUnits(variables);
      const stakingRouterContract = getStakingRouterContract(chainId, library, account);
      const tx: ContractTransaction = await mounted(stakingRouterContract.stake(bigStakingAmount));
      return await tx.wait();
    },
    {
      onSuccess: (data, variables) => {
        addTransaction({
          hash: data.transactionHash
        }, {
          summary: `Stake IMX (${variables}).`
        });
        reset({
          [STAKING_AMOUNT]: ''
        });
        imxAllowanceRefetch();
        imxBalanceRefetch();
      }
    }
  );

  const mounted = usePromise();
  const addTransaction = useTransactionAdder();

  const onStake = async (data: StakingFormData) => {
    if (!chainId) {
      throw new Error('Invalid chain ID!');
    }
    if (!library) {
      throw new Error('Invalid library!');
    }
    if (!account) {
      throw new Error('Invalid account!');
    }
    if (imxBalance === undefined) {
      throw new Error('Invalid IMX balance!');
    }
    if (imxAllowance === undefined) {
      throw new Error('Invalid IMX allowance!');
    }

    stakeMutation.mutate(data[STAKING_AMOUNT]);
  };

  const onApprove = async (data: StakingFormData) => {
    if (!chainId) {
      throw new Error('Invalid chain ID!');
    }
    if (!library) {
      throw new Error('Invalid library!');
    }
    if (!account) {
      throw new Error('Invalid account!');
    }

    approveMutation.mutate(data[STAKING_AMOUNT]);
  };

  const validateForm = (value: string): string | undefined => {
    if (imxBalance === undefined) {
      throw new Error('Invalid IMX balance!');
    }
    if (imxAllowance === undefined) {
      throw new Error('Invalid IMX allowance!');
    }

    const bigStakingAmount = parseUnits(value);
    if (bigStakingAmount.gt(imxBalance)) {
      return 'Staking amount must be less than your IMX balance!';
    }

    if (imxAllowance.gt(Zero) && bigStakingAmount.gt(imxAllowance)) {
      return 'Staking amount must be less than allowance!';
    }

    if (bigStakingAmount.eq(Zero)) {
      return 'Staking amount must be greater than zero!';
    }

    return undefined;
  };

  let approved;
  let floatIMXBalance;
  let floatIMXAllowance;
  if (imxBalanceSuccess && imxAllowanceSuccess) {
    if (imxBalance === undefined) {
      throw new Error('Invalid IMX balance!');
    }
    if (imxAllowance === undefined) {
      throw new Error('Invalid IMX allowance!');
    }

    approved = imxAllowance.gt(Zero);
    floatIMXBalance = formatNumberWithFixedDecimals(parseFloat(formatUnits(imxBalance)), 2);
    floatIMXAllowance = formatNumberWithFixedDecimals(parseFloat(formatUnits(imxAllowance)), 2);
  }

  let submitButtonText;
  if (imxBalanceSuccess && imxAllowanceSuccess) {
    submitButtonText = approved ? 'Stake' : 'Approve';
  }
  if (imxBalanceIdle || imxBalanceLoading || imxAllowanceIdle || imxAllowanceLoading) {
    submitButtonText = 'Loading...';
  }

  return (
    <>
      <form
        onSubmit={
          (imxBalanceSuccess && imxAllowanceSuccess) ?
            handleSubmit(approved ? onStake : onApprove) :
            undefined
        }
        {...props}>
        <TokenAmountLabel
          htmlFor={STAKING_AMOUNT}
          text='Stake IMX' />
        <TokenAmountField
          id={STAKING_AMOUNT}
          {...register(STAKING_AMOUNT, {
            required: {
              value: true,
              message: 'This field is required!'
            },
            validate: value => validateForm(value)
          })}
          balance={floatIMXBalance}
          allowance={floatIMXAllowance}
          error={!!errors[STAKING_AMOUNT]}
          helperText={errors[STAKING_AMOUNT]?.message}
          tokenUnit='IMX'
          walletActive={active}
          disabled={!imxAllowance || !imxBalance} />
        {active ? (
          <SubmitButton
            disabled={imxBalanceIdle || imxBalanceLoading || imxAllowanceIdle || imxAllowanceLoading}
            pending={approveMutation.isLoading || stakeMutation.isLoading}>
            {submitButtonText}
          </SubmitButton>
        ) : (
          <WalletConnectButton
            style={{
              height: 56
            }}
            className={clsx(
              'w-full',
              'text-lg'
            )} />
        )}
      </form>
      {(approveMutation.isError || stakeMutation.isError) && (
        <ErrorModal
          open={approveMutation.isError || stakeMutation.isError}
          onClose={() => {
            if (approveMutation.isError) {
              approveMutation.reset();
            }
            if (stakeMutation.isError) {
              stakeMutation.reset();
            }
          }}
          title='Error'
          description={
            approveMutation.error?.message || stakeMutation.error?.message || ''
          } />
      )}
    </>
  );
};

export default withErrorBoundary(StakingForm, {
  FallbackComponent: ErrorFallback,
  onReset: () => {
    window.location.reload();
  }
});
