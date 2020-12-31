import { Service, Inject } from 'typedi';
import { DateUtil } from '../../services/helpers/DateUtil';
import { ITransactionData, ITransactionStatus } from '../../interfaces/ITransactionData';
import { IAccountContext } from '@interfaces/IAccountContext';
import contextFactory, { ContextFactory } from '../../bootstrap/middleware/di/diContextFactory';
import InvalidParamError from '../../services/error/InvalidParamError';
import TxhashMismatchError from '../../services/error/TxhashMismatchError';
import * as bsv from 'bsv';
import { BitcoinRegex } from '../../services/helpers/BitcoinRegex';
import { txDataExtractor } from '../../util/txdataextractor';
import { ITXOutput } from '@interfaces/ITxOutput';
import InputsAlreadySpentError from '../../services/error/InputsAlreadySpentError';
import { DBUtils } from '../../services/helpers/DBUtils';
 
@Service('txModel')
class TxModel {

  constructor(
    @Inject('db') private db: ContextFactory,
    @Inject('logger') private logger) {}


  public async getUnconfirmedTxids(accountContext: IAccountContext): Promise<string[]> {
    const client = await this.db.getClient(accountContext);
    let result: any = await client.query(`
    SELECT tx.txid 
    FROM 
      tx
    WHERE 
      i IS NULL AND
      orphaned IS NOT TRUE AND
      tx.sync != 0 AND tx.sync != -1`
    );
    return result.rows.map((i) => { return i.txid });
  }
  
  public async isTxExist(accountContext: IAccountContext, txid: string): Promise<boolean> {
    const client = await this.db.getClient(accountContext);
    let result: any = await client.query(`SELECT txid FROM tx WHERE txid = $1`, [ txid ]);
    return !!result.rows[0];
  }

  public async getTxStats(accountContext: IAccountContext, from?: number, to?: number): Promise<any> {
    const client = await this.db.getClient(accountContext);
    
    let result: any = await client.query(`
      SELECT 
        count(*) as txcount
      FROM 
        tx 
      WHERE 
        created_at >= $1 AND 
        created_at <= $2
      `, [ from, to ]);

    const txCount = result.rows[0].txcount;
    let txSizeResult: any = await client.query(`
      SELECT 
        sum(size) as txsize
      FROM 
        tx 
      WHERE 
        created_at >= $1 AND 
        created_at <= $2
      `, [from, to ]);

    const txSize = txSizeResult.rows[0].txsize;

    let confirmedResult: any = await client.query(`
      SELECT 
        count(*) as confirmed
      FROM 
        tx 
      WHERE 
        created_at >= $1 AND 
        created_at <= $2 AND 
        completed IS TRUE
      `, [from, to ]);

    const confirmed = confirmedResult.rows[0].confirmed;

    let unconfirmedResult: any = await client.query(`
      SELECT 
        count(*) as unconfirmed
      FROM 
        tx 
      WHERE 
        created_at >= $1 AND 
        created_at <= $2 AND 
        completed IS NOT TRUE
      `, [from, to ]);

    const unconfirmed = unconfirmedResult.rows[0].unconfirmed;

    let expiredResult: any = await client.query(`
      SELECT 
        count(*) as expired
      FROM 
        tx 
      WHERE 
        created_at >= $1 AND 
        created_at <= $2 AND 
        completed IS NOT TRUE AND 
        sync = -1
    `, [from, to ]);

    const expired = expiredResult.rows[0].expired;

    let orphanedResult: any = await client.query(`
      SELECT 
        count(*) as orphaned
      FROM 
        tx 
      WHERE 
        created_at >= $1 AND 
        created_at <= $2 AND
        orphaned IS TRUE
    `, [from, to ]);

    const orphaned = orphanedResult.rows[0].orphaned;

    return {
      txCount: Number(txCount || 0),
      txSize: Number(txSize || 0),
      confirmed: Number(confirmed || 0),
      unconfirmed: Number(unconfirmed || 0),
      expired: Number(expired || 0),
      orphaned: Number(orphaned || 0)
    }
  }
  
  public async getGlobalStats(accountContext: IAccountContext): Promise<any> {
    const client = await this.db.getClient(accountContext);
    let totalReslt: any = await client.query(`
      SELECT 
        count(*) as total
      FROM 
        tx 
    `);
    const totalTx = totalReslt.rows[0].total;
    let sizeResult: any = await client.query(`
      SELECT 
        sum(size) as total
      FROM 
        tx
    `);
    const totalSize = sizeResult.rows[0].total;
    return {
      totalTx: Number(totalTx || 0),
      totalSize: Number(totalSize || 0)
    }
  }
  public async getTx(accountContext: IAccountContext, txid: string, rawtx?: boolean): Promise<string> {
    const client = await this.db.getClient(accountContext);
    let result: any = await client.query(`
      SELECT 
        tx.txid
        ,${rawtx ? `encode(tx.rawtx, 'hex') as rawtx,` : '' } tx.h
        ,tx.i
        ,tx.send
        ,tx.status
        ,tx.completed
        ,tx.orphaned
        ,tx.updated_at
        ,tx.created_at
        ,tx.dlq 
      FROM 
        tx 
      WHERE 
        tx.txid = $1 `, [ txid ]);

 
    return result.rows[0];
  }
  
  public async saveTxStatus(accountContext: IAccountContext, txid: string, txStatus: ITransactionStatus, blockhash: string | null, blockheight: number | null): Promise<string> {
    const client = await this.db.getClient(accountContext);
    const now = DateUtil.now();
    if (blockhash && blockheight) {
      let result: any = await client.query(`
      UPDATE tx SET status = $1, h = $2, i = $3, updated_at = $4, completed = true
      WHERE txid = $5`, [
        JSON.stringify(txStatus),
        blockhash,
        blockheight,
        now,
        txid
      ]);
      return result;
    }
    let result: any = await client.query(`UPDATE tx SET status = $1, updated_at = $2 WHERE txid = $3`, [ JSON.stringify(txStatus), now, txid ]);
    return result;
  }

  public async saveTxSend(accountContext: IAccountContext, txid: string, send: any): Promise<string> {
    const client = await this.db.getClient(accountContext);
    const now = DateUtil.now();
    let result: any = await client.query(`UPDATE tx SET send = $1, updated_at = $2 WHERE txid = $3`, [ JSON.stringify(send), now, txid ]);
    return result;
  }

  public async updateCompleted(accountContext: IAccountContext, txid: string, completed?: boolean, orphaned?: boolean): Promise<string> {
    const client = await this.db.getClient(accountContext);
    const now = DateUtil.now();
    let result: any = await client.query(`UPDATE tx SET updated_at = $1, completed = $2, orphaned = $3 WHERE txid = $4`, [ now, !!completed, orphaned, txid]);
    return result;
  }

  public async saveTxs(accountContext: IAccountContext, params?: { 
      channel?: string,
      set: {
        [key: string]: ITransactionData
      },
      hideRawtx?: boolean
    }): Promise<{
      txEvents : any[],
      savedTxs : string[],
      txoutEvents: ITXOutput[]
    }> {
 
    const pool = await this.db.getClient(accountContext);
    const client = await pool.connect();
    const now = DateUtil.now();
    const queueSettings = contextFactory.getQueueSettings(accountContext);
    const network = contextFactory.getNetwork(accountContext);
    const savedTxs = [];
    const txoutEvents: ITXOutput[] = [];
    const channelStr = params.channel ? params.channel : '';
    // note: we don't try/catch this because if connecting throws an exception
    // we don't need to dispose of the client (it will be undefined)
    try {
      await client.query('BEGIN');
      // Perform updates for each transaction in turn
      for (const txid in params.set) {
        if (!params.set.hasOwnProperty(txid)) {
          continue;
        }
        const nosync = queueSettings.nosync || !!params.set[txid].nosync;
        const rawtx = params.set[txid].rawtx;
        const metadata = params.set[txid].metadata;
        const tags = params.set[txid].tags;
        const sendStatus = params.set[txid].send;
        const savedOutpoints: Array<{txid: string, index: number }> = [];
        let expectedTxid = txid;
        if (!txid || !rawtx) {
          throw new InvalidParamError();
        }
        if (!BitcoinRegex.TXID_REGEX.test(expectedTxid)) {
          throw new InvalidParamError();
        }
        let parsedTx;
        parsedTx = new bsv.Transaction(rawtx)
        if (expectedTxid) {
          if (parsedTx.hash != expectedTxid) {
            throw new TxhashMismatchError();
          }
        } else {
          expectedTxid = parsedTx.txhash
        }
        const locktime = parsedTx.nLockTime;
        savedTxs.push(txid);
 
        let syncInitial = nosync ? 0 : 1; // Otherwise 'pending'
        let insertTxResult: any = await client.query(`
        INSERT INTO tx(txid, rawtx, updated_at, created_at, completed, size, locktime, txsource, send, sync, status_retries)
        VALUES ($1, $2, $3, $4, FALSE, $5, $6, $7, $8, $9, $10)
        ON CONFLICT(txid) 
        DO UPDATE
        SET 
          rawtx = EXCLUDED.rawtx, 
          updated_at = EXCLUDED.updated_at
          RETURNING txid`, [
          txid, DBUtils.encodeBufferToPG(rawtx), now, now, parsedTx.toBuffer().length, locktime, 0, sendStatus, syncInitial, 0
        ]);

        // Insert channel metadata
        const txmetainsert = JSON.stringify(metadata || {});
        const tagsinsert = JSON.stringify(tags || {});
        const datainsert = JSON.stringify(txDataExtractor(parsedTx) || {});
        let insertMetaResult: any = await client.query(`
        INSERT INTO txmeta(txid, channel, metadata, updated_at, created_at, tags, extracted)
        VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT(txid, channel) 
        DO UPDATE
        SET 
          updated_at = EXCLUDED.updated_at, 
          metadata = EXCLUDED.metadata, 
          tags = EXCLUDED.tags, 
          extracted = EXCLUDED.extracted`, [
          txid, channelStr, txmetainsert,now, now, tagsinsert, datainsert
        ]);
  
        // For each input, insert the txin
        let i = 0;
        for (const input of parsedTx.inputs) {
          if (input.isNull()) {
            //Skip coinbase
            continue;
          }
          const prevTxId = input.prevTxId.toString('hex');
          const outputIndex = input.outputIndex;
          const seq = input.sequenceNumber;
          const unlockScript = input.script.toBuffer().toString('hex');
          let checkExistsTxin: any = await client.query(`
          SELECT txid, index 
          FROM
            txin
          WHERE 
            (txid = $1 AND index = $2)
          `, [
            txid, i
          ]);
          // Exists, just ignore it then
          if (checkExistsTxin.rows.length) {
            continue;
          }
          // But first ensure this is not a double spend attempt
          const dspendQuery = `
          SELECT txid, index 
          FROM
            txin
          WHERE 
            (prevtxid = $1 AND previndex = $2)
          `;
          let checkExistsSpendTxin: any = await client.query(dspendQuery, [
            prevTxId, outputIndex
          ]);
          if (!checkExistsSpendTxin.rows.length) {
            let insertTxinResult: any = await client.query(`
            INSERT INTO txin(txid, index, prevtxid, previndex, unlockscript, seq)
            VALUES ($1, $2, $3, $4, $5, $6)
            `, [
              txid, i, prevTxId, outputIndex, DBUtils.encodeBufferToPG(unlockScript), seq
            ]);
          } else {
            // It exists, which means this is a double-spend, throw an exception
            this.logger.error("InputsAlreadySpentError", { txid: parsedTx.txid });
            throw new InputsAlreadySpentError();
          }
          i++;
        }

        i = 0;
        for (let i = 0; i < parsedTx.outputs.length; i++) {
          savedOutpoints.push({ txid: parsedTx.hash, index: i});
          const buffer = Buffer.from(parsedTx.outputs[i].script.toHex(), 'hex');
          const scripthash = bsv.crypto.Hash.sha256(buffer).reverse().toString('hex');
          let address = '';
          try {
            address = bsv.Address.fromScript(parsedTx.outputs[i].script, network).toString();
          } catch (err) {
            // Do nothing
          }
          
          let insertTxoutResult: any = await client.query(
            `INSERT INTO txout(txid, index, address, scripthash, script, satoshis)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT DO NOTHING`, [
              txid, i, address, scripthash, DBUtils.encodeBufferToPG(parsedTx.outputs[i].script.toHex()), parsedTx.outputs[i].satoshis
            ]);
        
          txoutEvents.push({
            address,
            scripthash,
            txid: expectedTxid,
            index: i,
            script: parsedTx.outputs[i].script.toHex(),
            satoshis: parsedTx.outputs[i].satoshis,
          });
        }
      }
 
      await client.query('COMMIT');
 
      let resultGetTxs: any = await client.query(`
      SELECT 
        txmeta.*,
        tx.txid
        ,${!params.hideRawtx ? `encode(tx.rawtx, 'hex') as rawtx,` : '' } tx.h
        ,tx.i
        ,tx.send
        ,tx.status
        ,tx.completed
        ,tx.updated_at
        ,tx.created_at
      FROM 
        tx 
      INNER JOIN 
        txmeta ON (tx.txid = txmeta.txid) 
      WHERE 
        tx.txid = ANY($1::varchar[])
      AND
        txmeta.channel = $2
      `, [ savedTxs, channelStr]);

      return {
        txEvents : resultGetTxs.rows,
        savedTxs,
        txoutEvents
      }
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  public async saveTxsForBlock(accountContext: IAccountContext, params?: { 
    channel?: string,
    set: {
      [key: string]: ITransactionData
    },
    newOutpointMonitorRecords:  {
      [outpoint: string]:  {
        txid: string,  
        index: number,
        // It could be spent in the same block
        spend_height?: number,
        spend_blockhash?: string,
        spend_txid?: string,
        spend_index?: number
      }
    },
    block: bsv.Block,
    height: number,
  }): Promise<{
    txEvents : any[],
    savedTxs : string[],
    txoutEvents: ITXOutput[]
  }> {

  const pool = await this.db.getClient(accountContext);
  const client = await pool.connect();
  const now = DateUtil.now();
  const queueSettings = contextFactory.getQueueSettings(accountContext);
  const network = contextFactory.getNetwork(accountContext);
  const savedTxs = [];
  const savedOutpoints: Array<{txid: string, index: number }> = [];
  const txoutEvents: ITXOutput[] = [];
  const channelStr = params.channel ? params.channel : '';
  // note: we don't try/catch this because if connecting throws an exception
  // we don't need to dispose of the client (it will be undefined)
  try {
    const startTime = (new Date()).getTime();
    this.logger.debug('Start Timer', { startTime });
    await client.query('BEGIN');

    /*
    const checPrev = `
      SELECT * FROM block_header WHERE hash = $1
    `;
    const resultBlock = await client.query(checPrev, [
      params.block.hash
    ]);
    
    if (resultBlock.rows && resultBlock.rows[0].hash) {
      ; // Nothing to do
    } else {
      const q = `
      INSERT INTO block_header(height, hash, version, merkleroot, time, nonce, bits, difficulty, header, previousblockhash)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (height)
      DO UPDATE
      SET
        hash = EXCLUDED.hash,
        version = EXCLUDED.version,
        merkleroot = EXCLUDED.merkleroot,
        time = EXCLUDED.time,
        nonce = EXCLUDED.nonce,
        difficulty = EXCLUDED.difficulty,
        previousblockhash = EXCLUDED.previousblockhash
      `;
      await client.query(q, [
        params.height,
        params.block.hash,
        params.block.header.version,
        params.block.header.merkleRoot.toString('hex'),
        params.block.header.time,
        params.block.header.nonce,
        params.block.header.bits,
        params.block.header.getDifficulty(),
        params.block.header.toBuffer(),
        Buffer.from(params.block.header.prevHash.toString('hex'), 'hex').reverse().toString('hex')
      ]);
    }
    */
    // Perform updates for each transaction in turn
    for (const txid in params.set) {
      if (!params.set.hasOwnProperty(txid)) {
        continue;
      }
      const nosync = queueSettings.nosync || !!params.set[txid].nosync;
      const rawtx = params.set[txid].rawtx;
      const metadata = params.set[txid].metadata;
      const tags = params.set[txid].tags;
      let expectedTxid = txid;
      if (!txid || !rawtx) {
        throw new InvalidParamError();
      }
      if (!BitcoinRegex.TXID_REGEX.test(expectedTxid)) {
        throw new InvalidParamError();
      }
      let parsedTx;
      parsedTx = new bsv.Transaction(rawtx)
      if (expectedTxid) {
        if (parsedTx.hash != expectedTxid) {
          throw new TxhashMismatchError();
        }
      } else {
        expectedTxid = parsedTx.txhash
      }
      const locktime = parsedTx.nLockTime;
      savedTxs.push(txid);
      const ss = DBUtils.encodeBufferToPG(rawtx);
 
      let insertTxResult: any = await client.query(`
      INSERT INTO tx(txid, rawtx, updated_at, created_at, completed, i, h, orphaned, size, locktime, txsource, sync)
      VALUES ($1, $2, $3, $4, TRUE, $5, $6, NULL, $7, $8, $9, 2)
      ON CONFLICT(txid) 
      DO UPDATE
      SET 
      rawtx = EXCLUDED.rawtx, 
      i = EXCLUDED.i, 
      h = EXCLUDED.h, 
      updated_at = EXCLUDED.updated_at, 
      completed = TRUE,
      sync = 2
      RETURNING txid`, [
        txid, ss, now, now, params.height, params.block.hash, parsedTx.toBuffer().length, locktime, 1
      ]);
 
       // Insert channel metadata
       const txmetainsert = JSON.stringify(metadata || {});
       const tagsinsert = JSON.stringify(tags || {});
       const datainsert = JSON.stringify(txDataExtractor(parsedTx) || {});
       let insertMetaResult: any = await client.query(`
       INSERT INTO txmeta(txid, channel, metadata, updated_at, created_at, tags, extracted)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT
       DO NOTHING
      `, [
         txid, channelStr, txmetainsert,now, now, tagsinsert, datainsert
       ]);
 
      // For each input, insert the txin
      let i = 0;
      for (const input of parsedTx.inputs) {
        if (input.isNull()) {
          //Skip coinbase
          continue;
        }
        const prevTxId = input.prevTxId.toString('hex');
        const outputIndex = input.outputIndex;
        const unlockScript = input.script.toBuffer().toString('hex');
       
        // Force updating the txin for the new transaction (Effectively deleting the doublespent tx's txin records)
        let insertTxinResult: any = await client.query(`
        INSERT INTO txin(txid, index, prevtxid, previndex, unlockscript)
        VALUES ($1, $2, $3, $4, $5) 
        ON CONFLICT(prevtxid, previndex) DO UPDATE
          SET
          txid = EXCLUDED.txid,
          index = EXCLUDED.index,
          unlockscript = EXCLUDED.unlockscript
        `, [
          txid, i, prevTxId, outputIndex, unlockScript
        ]);
        i++;
      }
 
      i = 0;
      for (let i = 0; i < parsedTx.outputs.length; i++) {
        savedOutpoints.push({ txid: parsedTx.hash, index: i});
        const buffer = Buffer.from(parsedTx.outputs[i].script.toHex(), 'hex');
        const scripthash = bsv.crypto.Hash.sha256(buffer).reverse().toString('hex');
        let address = '';
        try {
          address = bsv.Address.fromScript(parsedTx.outputs[i].script, network).toString();
        } catch (err) {
          // Do nothing
        }
        
        let insertTxoutResult: any = await client.query(
          `INSERT INTO txout(txid, index, address, scripthash, script, satoshis)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT DO NOTHING`, [
            txid, i, address, scripthash, parsedTx.outputs[i].script.toHex(), parsedTx.outputs[i].satoshis
          ]);
      
        txoutEvents.push({
          address,
          scripthash,
          txid: expectedTxid,
          index: i,
          script: parsedTx.outputs[i].script.toHex(),
          satoshis: parsedTx.outputs[i].satoshis,
        });
      }
    }
 
    let updateOrphans: any = await client.query(`
    WITH RECURSIVE d AS (
      SELECT tx.txid 
        from tx LEFT OUTER JOIN txin ON (tx.txid = txin.txid)
        WHERE txin.txid is null AND orphaned IS NOT TRUE
      UNION ALL
      SELECT txin.txid
      FROM d
      JOIN txin ON (txin.prevtxid = d.txid)
    )
    UPDATE tx
    SET
      i = NULL,
      h = NULL,
      orphaned = TRUE,
      completed = FALSE
      FROM d
      WHERE d.txid = tx.txid;
    `);
 
    // For all newly matched records we must save the txids
    let valuesStr = '';
    let counter = 0;
    // It could be spent in the same block

    let totalNewOutpoints = 0;
    for (const prop in params.newOutpointMonitorRecords) {
      if (!params.newOutpointMonitorRecords.hasOwnProperty(prop)) {
        continue;
      }
      totalNewOutpoints++;
    }
    for (const prop in params.newOutpointMonitorRecords) {
      if (!params.newOutpointMonitorRecords.hasOwnProperty(prop)) {
        continue;
      }
      let txid = `'${params.newOutpointMonitorRecords[prop].txid}'`;
      let index = `${params.newOutpointMonitorRecords[prop].index}`;
      let spend_height = params.newOutpointMonitorRecords[prop].spend_height ? `${params.newOutpointMonitorRecords[prop].spend_height}` : null;
      let spend_blockhash = params.newOutpointMonitorRecords[prop].spend_blockhash ? `'${params.newOutpointMonitorRecords[prop].spend_blockhash}'` : null;
      let spend_txid = params.newOutpointMonitorRecords[prop].spend_txid ? `'${params.newOutpointMonitorRecords[prop].spend_txid}'` : null;
      let spend_index = params.newOutpointMonitorRecords[prop].spend_index || params.newOutpointMonitorRecords[prop].spend_index === 0 ? `${params.newOutpointMonitorRecords[prop].spend_index}` : null;

      valuesStr += `(${txid}, ${index}, ${spend_height}, ${spend_blockhash}, ${spend_txid}, ${spend_index}, ${now}, ${now})`;

      if (counter < (totalNewOutpoints - 1)) {
        valuesStr += ',';
      }

      counter++;
    }
    if (counter) {
      const q = `
      INSERT INTO outpointmonitor (txid, index, spend_height, spend_blockhash, spend_txid, spend_index, updated_at, created_at) 
      VALUES
      ${valuesStr}
      ON CONFLICT (txid, index) DO UPDATE
      SET 
      updated_at=EXCLUDED.updated_at,
      spend_height=EXCLUDED.spend_height,
      spend_blockhash=EXCLUDED.spend_blockhash,
      spend_txid=EXCLUDED.spend_txid,
      spend_index=EXCLUDED.spend_index
      `;
      let insertOutpoints: any = await client.query(q);
    }
    // Remove older than about 10 days
    const q = `DELETE FROM outpointmonitor WHERE spend_height < $1`;
    let deleteOldOutpoints: any = await client.query(q, [params.height - 1440]);

    await client.query('COMMIT');
    const endtime = (new Date()).getTime();
    this.logger.debug('End Timer Commit', { time: (endtime - startTime) / 1000, savedTxs: savedTxs.length });

    let resultGetTxs: any = await client.query(`
    SELECT 
      txmeta.*,
      tx.txid,
      encode(tx.rawtx, 'hex') as rawtx
      ,tx.h
      ,tx.i
      ,tx.send
      ,tx.status
      ,tx.completed
      ,tx.updated_at
      ,tx.created_at
    FROM 
      tx 
    INNER JOIN 
      txmeta ON (tx.txid = txmeta.txid) 
    WHERE 
      tx.txid = ANY($1::varchar[])
    AND
      txmeta.channel = $2
    `, [ savedTxs, channelStr]);

    return {
      txEvents : resultGetTxs.rows,
      savedTxs: savedTxs,
      txoutEvents
    }
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
}

export default TxModel;
