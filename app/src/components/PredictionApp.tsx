import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAccount, usePublicClient, useReadContract } from 'wagmi';
import { Contract, ethers } from 'ethers';
import { Header } from './Header';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import '../styles/PredictionApp.css';

const ZERO_HANDLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MS_PER_DAY = 86_400_000;

type PriceRecord = {
  day: bigint;
  eth: bigint;
  btc: bigint;
  timestamp: bigint;
};

const parsePriceToCents = (value: string): bigint | null => {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) {
    return null;
  }

  const [whole, fraction = ''] = trimmed.split('.');
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction)) {
    return null;
  }

  const fractionPadded = (fraction + '00').slice(0, 2);
  return BigInt(whole) * 100n + BigInt(fractionPadded || '0');
};

const formatPriceFromCents = (value?: bigint | null) => {
  if (value === null || value === undefined) {
    return '--';
  }
  const whole = value / 100n;
  const cents = (value % 100n).toString().padStart(2, '0');
  return `${whole.toString()}.${cents}`;
};

const formatDay = (day?: bigint | null) => {
  if (day === null || day === undefined) {
    return '—';
  }
  const date = new Date(Number(day) * MS_PER_DAY);
  return date.toUTCString().replace('GMT', 'UTC');
};

export function PredictionApp() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [token, setToken] = useState<'ETH' | 'BTC'>('ETH');
  const [direction, setDirection] = useState<'1' | '2'>('1');
  const [priceInput, setPriceInput] = useState('');
  const [stakeInput, setStakeInput] = useState('');
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);
  const [pointsValue, setPointsValue] = useState<string | null>(null);
  const [pointsStatus, setPointsStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmingToken, setConfirmingToken] = useState<number | null>(null);
  const [isDecryptingPoints, setIsDecryptingPoints] = useState(false);
  const [recentPrices, setRecentPrices] = useState<PriceRecord[]>([]);
  const hasContractAddress = true;

  const { data: currentDay } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getCurrentDay',
    query: {
      enabled: hasContractAddress,
    },
  });

  const { data: latestDay } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getLatestDay',
    query: {
      enabled: hasContractAddress,
    },
  });

  const { data: latestPrice } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getDailyPrice',
    args: latestDay !== undefined ? [latestDay] : undefined,
    query: {
      enabled: hasContractAddress && latestDay !== undefined,
    },
  });

  const yesterdayDay = useMemo(() => {
    if (typeof currentDay !== 'bigint') {
      return null;
    }
    if (currentDay === 0n) {
      return null;
    }
    return currentDay - 1n;
  }, [currentDay]);

  const { data: yesterdayPrice } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getDailyPrice',
    args: yesterdayDay !== null ? [yesterdayDay] : undefined,
    query: {
      enabled: hasContractAddress && yesterdayDay !== null,
    },
  });

  const { data: pointsHandle } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getUserPoints',
    args: address ? [address] : undefined,
    query: {
      enabled: hasContractAddress && !!address,
    },
  });

  const { data: ethPrediction } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPrediction',
    args: address && yesterdayDay !== null ? [address, 0, yesterdayDay] : undefined,
    query: {
      enabled: hasContractAddress && !!address && yesterdayDay !== null,
    },
  });

  const { data: btcPrediction } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getPrediction',
    args: address && yesterdayDay !== null ? [address, 1, yesterdayDay] : undefined,
    query: {
      enabled: hasContractAddress && !!address && yesterdayDay !== null,
    },
  });

  useEffect(() => {
    if (!publicClient || latestDay === undefined || !hasContractAddress) {
      return;
    }

    let active = true;

    const loadRecentPrices = async () => {
      const records: PriceRecord[] = [];
      for (let index = 0; index < 5; index += 1) {
        const day = latestDay - BigInt(index);
        if (day < 0n) {
          break;
        }
        const record = await publicClient.readContract({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'getDailyPrice',
          args: [day],
        });
        const [eth, btc, timestamp] = record as [bigint, bigint, bigint];
        if (timestamp === 0n) {
          continue;
        }
        records.push({ day, eth, btc, timestamp });
      }
      if (active) {
        setRecentPrices(records);
      }
    };

    loadRecentPrices().catch((error) => {
      console.error('Failed to load price history', error);
    });

    return () => {
      active = false;
    };
  }, [publicClient, latestDay]);

  const targetDayLabel = useMemo(() => {
    if (typeof currentDay !== 'bigint') {
      return '—';
    }
    return formatDay(currentDay + 1n);
  }, [currentDay]);

  const latestPriceRecord = latestPrice as [bigint, bigint, bigint] | undefined;
  const latestTimestamp = latestPriceRecord ? latestPriceRecord[2] : null;
  const hasLatest = latestTimestamp !== null && latestTimestamp > 0n;
  const latestEth = latestPriceRecord && hasLatest ? latestPriceRecord[0] : null;
  const latestBtc = latestPriceRecord && hasLatest ? latestPriceRecord[1] : null;

  const yesterdayPriceRecord = yesterdayPrice as [bigint, bigint, bigint] | undefined;
  const yesterdayTimestamp = yesterdayPriceRecord ? yesterdayPriceRecord[2] : null;
  const hasYesterday = yesterdayTimestamp !== null && yesterdayTimestamp > 0n;
  const yesterdayEth = yesterdayPriceRecord && hasYesterday ? yesterdayPriceRecord[0] : null;
  const yesterdayBtc = yesterdayPriceRecord && hasYesterday ? yesterdayPriceRecord[1] : null;

  const handleSubmitPrediction = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitStatus(null);

    if (!hasContractAddress) {
      setSubmitStatus('Set the deployed contract address to continue.');
      return;
    }

    if (!address || !instance || !signerPromise) {
      setSubmitStatus('Connect your wallet and wait for encryption to load.');
      return;
    }

    const parsedPrice = parsePriceToCents(priceInput);
    if (parsedPrice === null) {
      setSubmitStatus('Enter a valid price (USD with 2 decimals).');
      return;
    }

    let stakeWei: bigint;
    try {
      stakeWei = ethers.parseEther(stakeInput);
    } catch (error) {
      setSubmitStatus('Enter a valid stake amount in ETH.');
      return;
    }

    if (stakeWei === 0n) {
      setSubmitStatus('Stake must be greater than 0.');
      return;
    }

    setIsSubmitting(true);

    try {
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add64(parsedPrice);
      input.add8(Number(direction));
      const encryptedInput = await input.encrypt();

      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      const tokenId = token === 'ETH' ? 0 : 1;
      const tx = await contract.placePrediction(
        tokenId,
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.inputProof,
        { value: stakeWei },
      );
      await tx.wait();

      setSubmitStatus('Prediction submitted. Check back tomorrow to confirm.');
      setPriceInput('');
      setStakeInput('');
    } catch (error) {
      console.error('Prediction failed', error);
      setSubmitStatus('Submission failed. Please retry after wallet confirmation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirm = async (tokenId: number) => {
    if (!hasContractAddress) {
      setConfirmStatus('Set the deployed contract address to continue.');
      return;
    }

    if (!address || !signerPromise || yesterdayDay === null) {
      setConfirmStatus('Connect your wallet and wait for the next day.');
      return;
    }

    setConfirmingToken(tokenId);
    setConfirmStatus(null);

    try {
      const signer = await signerPromise;
      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.confirmPrediction(tokenId, yesterdayDay);
      await tx.wait();
      setConfirmStatus('Confirmation submitted. Refresh points to see updates.');
    } catch (error) {
      console.error('Confirmation failed', error);
      setConfirmStatus('Confirmation failed. Check the day and try again.');
    } finally {
      setConfirmingToken(null);
    }
  };

  const handleDecryptPoints = async () => {
    setPointsStatus(null);
    setPointsValue(null);

    if (!hasContractAddress) {
      setPointsStatus('Set the deployed contract address to continue.');
      return;
    }

    if (!address || !instance || !signerPromise) {
      setPointsStatus('Connect your wallet to decrypt points.');
      return;
    }

    if (!pointsHandle || pointsHandle === ZERO_HANDLE) {
      setPointsValue('0');
      return;
    }

    setIsDecryptingPoints(true);

    try {
      const keypair = instance.generateKeypair();
      const handleContractPairs = [{ handle: pointsHandle, contractAddress: CONTRACT_ADDRESS }];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '7';
      const contractAddresses = [CONTRACT_ADDRESS];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signer = await signerPromise;
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decrypted = result[pointsHandle] ?? '0';
      const formatted = ethers.formatEther(BigInt(decrypted));
      setPointsValue(formatted);
    } catch (error) {
      console.error('Points decryption failed', error);
      setPointsStatus('Decryption failed. Please retry.');
    } finally {
      setIsDecryptingPoints(false);
    }
  };

  const predictionCards = useMemo(
    () => [
      {
        label: 'ETH',
        tokenId: 0,
        prediction: ethPrediction as [string, string, bigint, boolean] | undefined,
        actual: yesterdayEth,
      },
      {
        label: 'BTC',
        tokenId: 1,
        prediction: btcPrediction as [string, string, bigint, boolean] | undefined,
        actual: yesterdayBtc,
      },
    ],
    [ethPrediction, btcPrediction, yesterdayEth, yesterdayBtc],
  );

  return (
    <div className="prediction-app">
      <Header />

      <main className="prediction-main">
        {!hasContractAddress && (
          <div className="alert">
            Contract address is not set. Update `app/src/config/contracts.ts` with the deployed address from Sepolia.
          </div>
        )}
        <section className="hero">
          <div>
            <p className="hero-eyebrow">Daily encrypted prediction market</p>
            <h2>Predict ETH &amp; BTC, stake ETH, earn encrypted points.</h2>
            <p className="hero-subtitle">
              Prices refresh at UTC midnight. Your price and direction stay encrypted end-to-end.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-card-row">
              <div>
                <span className="hero-label">Latest ETH</span>
                <strong>${formatPriceFromCents(latestEth)}</strong>
              </div>
              <div>
                <span className="hero-label">Latest BTC</span>
                <strong>${formatPriceFromCents(latestBtc)}</strong>
              </div>
            </div>
            <p className="hero-footnote">
              Updated: {hasLatest ? new Date(Number(latestTimestamp) * 1000).toUTCString() : '—'}
            </p>
          </div>
        </section>

        <section className="grid">
          <div className="card">
            <div className="card-header">
              <h3>Place a prediction</h3>
              <span className="pill">Target day: {targetDayLabel}</span>
            </div>
            <form className="prediction-form" onSubmit={handleSubmitPrediction}>
              <label>
                Token
                <div className="segmented">
                  <button
                    type="button"
                    className={token === 'ETH' ? 'active' : ''}
                    onClick={() => setToken('ETH')}
                  >
                    ETH
                  </button>
                  <button
                    type="button"
                    className={token === 'BTC' ? 'active' : ''}
                    onClick={() => setToken('BTC')}
                  >
                    BTC
                  </button>
                </div>
              </label>

              <label>
                Predicted price (USD, 2 decimals)
                <input
                  type="text"
                  value={priceInput}
                  onChange={(event) => setPriceInput(event.target.value)}
                  placeholder="e.g. 3524.50"
                  inputMode="decimal"
                />
              </label>

              <label>
                Direction
                <div className="segmented">
                  <button
                    type="button"
                    className={direction === '1' ? 'active' : ''}
                    onClick={() => setDirection('1')}
                  >
                    Greater (1)
                  </button>
                  <button
                    type="button"
                    className={direction === '2' ? 'active' : ''}
                    onClick={() => setDirection('2')}
                  >
                    Less (2)
                  </button>
                </div>
              </label>

              <label>
                Stake in ETH
                <input
                  type="text"
                  value={stakeInput}
                  onChange={(event) => setStakeInput(event.target.value)}
                  placeholder="0.01"
                  inputMode="decimal"
                />
              </label>

              <button className="primary" type="submit" disabled={isSubmitting || zamaLoading || !hasContractAddress}>
                {zamaLoading ? 'Loading encryption...' : isSubmitting ? 'Encrypting & sending...' : 'Submit prediction'}
              </button>
              {submitStatus && <p className="form-status">{submitStatus}</p>}
              {zamaError && <p className="form-status warning">{zamaError}</p>}
            </form>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Confirm yesterday</h3>
              <span className="pill">Day: {formatDay(yesterdayDay)}</span>
            </div>

            {!hasYesterday ? (
              <p className="muted">No recorded price yet for yesterday.</p>
            ) : (
              <div className="confirmation-grid">
                {predictionCards.map((card) => {
                  const stakeValue = card.prediction ? card.prediction[2] : 0n;
                  const claimed = card.prediction ? card.prediction[3] : false;
                  return (
                    <div key={card.label} className="confirmation-card">
                      <div className="confirmation-header">
                        <h4>{card.label}</h4>
                        <span className={claimed ? 'badge success' : 'badge'}>{claimed ? 'Claimed' : 'Open'}</span>
                      </div>
                      <p className="muted">Actual price: ${formatPriceFromCents(card.actual)}</p>
                      <p className="muted">
                        Stake:{' '}
                        {stakeValue > 0n ? `${ethers.formatEther(stakeValue)} ETH` : 'No prediction'}
                      </p>
                      <button
                        type="button"
                        className="secondary"
                        disabled={stakeValue === 0n || claimed || confirmingToken === card.tokenId || !hasContractAddress}
                        onClick={() => handleConfirm(card.tokenId)}
                      >
                        {confirmingToken === card.tokenId ? 'Confirming...' : 'Confirm prediction'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {confirmStatus && <p className="form-status">{confirmStatus}</p>}
          </div>
        </section>

        <section className="grid">
          <div className="card">
            <div className="card-header">
              <h3>Encrypted points</h3>
              <span className="pill">Claimed in ETH units</span>
            </div>
            <p className="muted">
              Points equal your winning stake. Decrypt to view your total balance.
            </p>
            <div className="points-row">
              <button
                className="primary"
                type="button"
                disabled={isDecryptingPoints || !hasContractAddress}
                onClick={handleDecryptPoints}
              >
                {isDecryptingPoints ? 'Decrypting...' : 'Decrypt points'}
              </button>
              <div className="points-display">
                <span className="points-label">Balance</span>
                <strong>{pointsValue ? `${pointsValue} ETH` : '—'}</strong>
              </div>
            </div>
            {pointsStatus && <p className="form-status">{pointsStatus}</p>}
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Recent price history</h3>
              <span className="pill">UTC daily close</span>
            </div>
            {recentPrices.length === 0 ? (
              <p className="muted">No price history yet.</p>
            ) : (
              <div className="history-list">
                {recentPrices.map((record) => (
                  <div key={record.day.toString()} className="history-row">
                    <div>
                      <span className="history-day">{formatDay(record.day)}</span>
                      <span className="history-meta">
                        {new Date(Number(record.timestamp) * 1000).toUTCString()}
                      </span>
                    </div>
                    <div className="history-prices">
                      <span>ETH ${formatPriceFromCents(record.eth)}</span>
                      <span>BTC ${formatPriceFromCents(record.btc)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card guidance">
          <h3>How it works</h3>
          <ul>
            <li>Submit an encrypted price and direction for tomorrow.</li>
            <li>Prices update every day at UTC 00:00 and are recorded on-chain.</li>
            <li>Come back the following day to confirm and earn encrypted points.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
