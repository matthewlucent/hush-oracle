// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEuint8, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title HushOracle
/// @notice Daily price predictions for ETH and BTC using FHE-encrypted inputs.
contract HushOracle is ZamaEthereumConfig {
    enum Token {
        ETH,
        BTC
    }

    struct DailyPrice {
        uint64 ethPrice;
        uint64 btcPrice;
        uint256 timestamp;
    }

    struct Prediction {
        euint64 price;
        euint8 direction;
        uint256 stake;
        bool claimed;
    }

    address public owner;
    uint256 public latestRecordedDay;

    mapping(uint256 => DailyPrice) private dailyPrices;
    mapping(address => mapping(uint8 => mapping(uint256 => Prediction))) private predictions;
    mapping(address => euint64) private points;
    mapping(address => bool) private pointsInitialized;

    event DailyPriceUpdated(uint256 indexed day, uint64 ethPrice, uint64 btcPrice);
    event PredictionPlaced(address indexed user, uint8 indexed token, uint256 indexed day, uint256 stake);
    event PredictionConfirmed(address indexed user, uint8 indexed token, uint256 indexed day, uint256 stake);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error AlreadyPredicted();
    error AlreadyClaimed();
    error InvalidToken();
    error MissingPrediction();
    error MissingPrice();
    error StakeRequired();
    error StakeTooLarge();
    error TooEarly();
    error Unauthorized();
    error ZeroAddress();
    error PriceAlreadySet();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Unauthorized();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert ZeroAddress();
        }
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function getCurrentDay() public view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function getLatestDay() external view returns (uint256) {
        return latestRecordedDay;
    }

    function getDailyPrice(uint256 day) external view returns (uint64 ethPrice, uint64 btcPrice, uint256 timestamp) {
        DailyPrice storage record = dailyPrices[day];
        return (record.ethPrice, record.btcPrice, record.timestamp);
    }

    function getPrediction(address user, uint8 token, uint256 day)
        external
        view
        returns (euint64 price, euint8 direction, uint256 stake, bool claimed)
    {
        Prediction storage prediction = predictions[user][token][day];
        return (prediction.price, prediction.direction, prediction.stake, prediction.claimed);
    }

    function getUserPoints(address user) external view returns (euint64) {
        return points[user];
    }

    function updateDailyPrices(uint64 ethPrice, uint64 btcPrice) external onlyOwner {
        uint256 day = getCurrentDay();
        if (dailyPrices[day].timestamp != 0) {
            revert PriceAlreadySet();
        }
        dailyPrices[day] = DailyPrice({ethPrice: ethPrice, btcPrice: btcPrice, timestamp: block.timestamp});
        latestRecordedDay = day;
        emit DailyPriceUpdated(day, ethPrice, btcPrice);
    }

    function placePrediction(
        uint8 token,
        externalEuint64 encryptedPrice,
        externalEuint8 encryptedDirection,
        bytes calldata inputProof
    ) external payable {
        if (token > uint8(Token.BTC)) {
            revert InvalidToken();
        }
        if (msg.value == 0) {
            revert StakeRequired();
        }
        if (msg.value > type(uint64).max) {
            revert StakeTooLarge();
        }

        uint256 targetDay = getCurrentDay() + 1;
        Prediction storage prediction = predictions[msg.sender][token][targetDay];
        if (prediction.stake != 0) {
            revert AlreadyPredicted();
        }

        euint64 price = FHE.fromExternal(encryptedPrice, inputProof);
        euint8 direction = FHE.fromExternal(encryptedDirection, inputProof);

        prediction.price = price;
        prediction.direction = direction;
        prediction.stake = msg.value;
        prediction.claimed = false;

        FHE.allowThis(price);
        FHE.allowThis(direction);
        FHE.allow(price, msg.sender);
        FHE.allow(direction, msg.sender);

        emit PredictionPlaced(msg.sender, token, targetDay, msg.value);
    }

    function confirmPrediction(uint8 token, uint256 day) external {
        if (token > uint8(Token.BTC)) {
            revert InvalidToken();
        }
        if (day >= getCurrentDay()) {
            revert TooEarly();
        }

        DailyPrice storage record = dailyPrices[day];
        if (record.timestamp == 0) {
            revert MissingPrice();
        }

        Prediction storage prediction = predictions[msg.sender][token][day];
        if (prediction.stake == 0) {
            revert MissingPrediction();
        }
        if (prediction.claimed) {
            revert AlreadyClaimed();
        }

        uint64 actualPrice = token == uint8(Token.ETH) ? record.ethPrice : record.btcPrice;
        euint64 actualPriceEncrypted = FHE.asEuint64(actualPrice);

        ebool isGreater = FHE.gt(prediction.price, actualPriceEncrypted);
        ebool isLess = FHE.lt(prediction.price, actualPriceEncrypted);
        ebool wantsGreater = FHE.eq(prediction.direction, FHE.asEuint8(1));
        ebool wantsLess = FHE.eq(prediction.direction, FHE.asEuint8(2));
        ebool correct = FHE.or(FHE.and(wantsGreater, isGreater), FHE.and(wantsLess, isLess));

        if (!pointsInitialized[msg.sender]) {
            points[msg.sender] = FHE.asEuint64(0);
            pointsInitialized[msg.sender] = true;
        }

        euint64 reward = FHE.select(
            correct,
            FHE.asEuint64(uint64(prediction.stake)),
            FHE.asEuint64(0)
        );
        points[msg.sender] = FHE.add(points[msg.sender], reward);
        prediction.claimed = true;

        FHE.allowThis(points[msg.sender]);
        FHE.allow(points[msg.sender], msg.sender);

        emit PredictionConfirmed(msg.sender, token, day, prediction.stake);
    }
}
