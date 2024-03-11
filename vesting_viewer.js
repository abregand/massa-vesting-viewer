async function vestingViewer(walletAddress) {
    const URL_API = "https://mainnet.massa.net/api/v2";
    const CHAIN_ID = 77658377;
    const SC_ADDRESS = "AS12qzyNBDnwqq2vYwvUMHzrtMkVp6nQGJJ3TETVKF5HCd4yymzJP";

    // Initialize the client to interact with the Massa network
    const client = await window.massa.ClientFactory.createDefaultClient(
        URL_API,
        CHAIN_ID,
        true
    );

    // Fetch datastore keys associated with the smart contract address
    const addrInfo = await client.publicApiClient.getAddresses([SC_ADDRESS]);
    const allKeys = addrInfo[0].candidate_datastore_keys;

    // list of sessions
    let sessions = [];

    // find the keys
    for (let i = 0; i < allKeys.length; i++) {
        let key = allKeys[i];

        let deser = new window.massa.Args(key);
        let keyTag = Number(deser.nextU8());

        if (keyTag !== 0x02 && keyTag !== 0x03) {
            // only interested in VestingInfoKey & ClaimedAmountKey
            continue;
        }

        let keyAddress = deser.nextString();
        let keySessionId = deser.nextU64();

        if (keyAddress !== walletAddress) {
            continue;
        }

        // find the session in the list of sessions
        let sessionIndex = sessions.findIndex((s) => s.id === keySessionId);
        if (sessionIndex === -1) {
            // create a new session
            sessions.push({
                address: keyAddress,
                id: keySessionId,
                vestingInfoKey: [],
                claimedAmountKey: [],
                claimedAmount: BigInt(0),
                availableAmount: BigInt(0),
            });
            sessionIndex = sessions.length - 1;
        }

        if (keyTag === 0x02) {
            // vesting info key
            sessions[sessionIndex].vestingInfoKey = key;
        } else if (keyTag === 0x03) {
            // claimed amount key
            sessions[sessionIndex].claimedAmountKey = key;
        }
    }

    // Here we have all the sessions of the user and their datastore keys.
    // Now get the values from the datastore.
    let queryKeys = [];
    for (let i = 0; i < sessions.length; i++) {
        queryKeys.push({
            address: SC_ADDRESS,
            key: Uint8Array.from(sessions[i].vestingInfoKey),
        });
        queryKeys.push({
            address: SC_ADDRESS,
            key: Uint8Array.from(sessions[i].claimedAmountKey),
        });
    }
    let res = await client.publicApi().getDatastoreEntries(queryKeys);

    if (res.length !== queryKeys.length) {
        throw new Error('Error: datastore entries length invalid');
    }

    let availableToClaimExport = BigInt(0);
    let claimedAmountExport = BigInt(0);
    let totalAmountExport = BigInt(0);
    let now = Date.now();
    for (let i = 0; i < queryKeys.length; i += 2) {
        let vestingInfoSerialized = res[i].candidate_value;
        let claimedAmountSerialized = res[i + 1].candidate_value;

        if (
            vestingInfoSerialized === null ||
            claimedAmountSerialized === null
        ) {
            // throw error
            throw new Error('Error: datastore entry not found');
        }

        if (
            vestingInfoSerialized?.length === 0 ||
            claimedAmountSerialized?.length === 0
        ) {
            // Note: sometimes we got empty Uint8Array
            // This prevents an error in our app
            console.error('Empty datastore entry');
            continue;
        }

        // deserialize the vesting info
        let deser = new window.massa.Args(vestingInfoSerialized);

        let vestingInfo = {
            toAddr: deser.nextString(),
            totalAmount: deser.nextU64(),
            startTimestamp: deser.nextU64(),
            initialReleaseAmount: deser.nextU64(),
            cliffDuration: deser.nextU64(),
            linearDuration: deser.nextU64(),
            tag: deser.nextString(),
        };

        // deserialize the claimed amount
        deser = new window.massa.Args(claimedAmountSerialized);
        let claimedAmount = deser.nextU64();
        // add the values to the session
        sessions[i / 2].vestingInfo = vestingInfo;
        sessions[i / 2].claimedAmount = claimedAmount;

        // calculate the available amount
        let availableAmount = BigInt(0);
        if (now < vestingInfo.startTimestamp) {
            // before start
            availableAmount = BigInt(0);
        } else if (
            now <
            vestingInfo.startTimestamp + vestingInfo.cliffDuration
        ) {
            // cliff
            availableAmount = vestingInfo.initialReleaseAmount;
        } else if (
            now >
            vestingInfo.startTimestamp +
            vestingInfo.cliffDuration +
            vestingInfo.linearDuration
        ) {
            // after linear period
            availableAmount = vestingInfo.totalAmount;
        } else {
            // in the linear period
            let timePassed =
                BigInt(now) -
                (vestingInfo.startTimestamp + vestingInfo.cliffDuration);
            availableAmount =
                vestingInfo.initialReleaseAmount +
                ((vestingInfo.totalAmount - vestingInfo.initialReleaseAmount) *
                    timePassed) /
                vestingInfo.linearDuration;
        }
        // update the available amount
        sessions[i / 2].availableAmount = availableAmount - claimedAmount;
        availableToClaimExport += availableAmount - claimedAmount;
        claimedAmountExport += claimedAmount;
        totalAmountExport += vestingInfo.totalAmount;
    }

    return {'availableAmount': window.massa.toMAS(availableToClaimExport).toString(), 'claimedAmount': window.massa.toMAS(claimedAmountExport).toString(), 'totalAmount': window.massa.toMAS(totalAmountExport).toString()};
}