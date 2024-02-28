const { HaloGateway } = require("@arx-research/libhalo/api/desktop.js");
const {haloRecoverPublicKey, haloConvertSignature, SECP256k1_ORDER} = require('@arx-research/libhalo/api/common.js');
const websocket = require("websocket"); // Assuming you have a websocket library
const QRCode = require("qrcode"); // Assuming QRCode library for generating QR codes

async function instantiateGateway() {
  let gate = new HaloGateway('wss://s1.halo-gateway.arx.org', {
    createWebSocket: (url) => new websocket.w3cwebsocket(url)
  });

  let pairInfo;
  try {
    pairInfo = await gate.startPairing();
    // console.log('URL in the QR code:', pairInfo.qrCode);
  } catch (e) {
    console.log(e);
  }

  QRCode.toString(pairInfo.execURL, {type: 'terminal'}, function (err, qrtext) {
    if (err) {
      console.error("Error generating QR code:", err);
      return;
    }
    console.log('Please scan the following QR code using your smartphone:');
    console.log('');
    console.log(qrtext);
    console.log('');
  });

  console.log('Waiting for smartphone to connect...');
  await gate.waitConnected();

  return gate;
}

async function getChipPublicKeys(gate) {
    let cmd = {
      "name": "get_pkeys",
    };
  
    const rawKeys = await gate.execHaloCmd(cmd);
    return [rawKeys.etherAddresses['1'], rawKeys.etherAddresses['2'], rawKeys];
}

async function getChipSigWithGateway(gate, domain, types, value) {
  let cmd = {
    "name": "sign",
    "typedData": {
        domain,
        types,
        value,
      },
    "keyNo": 1
  };

  return await gate.execHaloCmd(cmd);
}

async function getChipSigWithGatewayLegacy(gate, domain, types, value) {
    let cmd = {
      "name": "sign",
      "typedData": {
          domain,
          types,
          value,
        },
      "keyNo": 1,
      "legacySignCommand": true
    };
  
    return await gate.execHaloCmd(cmd);
}

async function haloRecoverKey(digest, der) {
    return await haloRecoverPublicKey(digest, der, SECP256k1_ORDER);
}
async function haloConvert(digest, der, publicKey) {
    return await haloConvertSignature(digest, der, publicKey, SECP256k1_ORDER);
}

// Exporting the functions so they can be used elsewhere
module.exports = {
  instantiateGateway,
  getChipPublicKeys,
  getChipSigWithGateway,
  getChipSigWithGatewayLegacy,
  haloRecoverKey,
  haloConvert
};
