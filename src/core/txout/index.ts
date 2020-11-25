import { Service, Inject } from 'typedi';
import { IAccountContext } from '@interfaces/IAccountContext';
import { ContextFactory } from '../../bootstrap/middleware/di/diContextFactory';
import InvalidParamError from '../../services/error/InvalidParamError';

@Service('txoutModel')
class TxoutModel {
  constructor(@Inject('db') private db: ContextFactory) {}

  public async getTxoutByScriptHash(accountContext: IAccountContext, scripthash: string, offset: number, limit: number, script?: boolean, unspent?: boolean): Promise<string> {
    const client = await this.db.getClient(accountContext);
    let result: any;
    let split = scripthash.split(',');

    let q = `
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis, tx.i, tx.h,
    txout.script, txin.txid as spend_txid, txin.index as spend_index
    FROM 
      txout 
    JOIN 
      tx ON (txout.txid = tx.txid)
    LEFT OUTER JOIN 
      txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
    WHERE
    scripthash IN (${this.joinQuote(split)}) AND
    tx.orphaned IS NOT TRUE 
    ${unspent ? 'AND txin.prevtxid IS NULL' : ''}
    OFFSET $1
    LIMIT $2`;
    result = await client.query(q, [ offset, limit ]);
    return result.rows;
  }
 

  public async getTxoutByAddress(accountContext: IAccountContext, address: string, offset: number, limit: number, script?: boolean, unspent?: boolean): Promise<string> {
    const client = await this.db.getClient(accountContext);
    let result: any;
    let split = address.split(',');
    let q = `
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis,  tx.i, tx.h,
    txout.script, txin.txid as spend_txid, txin.index as spend_index
    FROM 
      txout 
    JOIN 
      tx ON (txout.txid = tx.txid)
    LEFT OUTER JOIN 
      txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
    WHERE
    address IN (${this.joinQuote(split)}) AND
    tx.orphaned IS NOT TRUE 
    ${unspent ? 'AND txin.prevtxid IS NULL' : ''}
    OFFSET $1
    LIMIT $2`;
    result = await client.query(q, [ offset, limit ]);
    return result.rows;
  }

  /**
   * Todo: Refactor to not repeat queries
   */
  public async getTxoutsByGroup(accountContext: IAccountContext, params: { groupname: string, script?: boolean, limit: any, offset: any, unspent?: boolean}): Promise<any> {
    const client = await this.db.getClient(accountContext);
    let result: any;
    let q = `
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis,  tx.i, tx.h,
    txout.script, txin.txid as spend_txid, txin.index as spend_index, txoutgroup.groupname
    FROM 
      txoutgroup
    JOIN
      txout ON (txoutgroup.scriptid = txout.address OR txoutgroup.scriptid = txout.scripthash)
    JOIN 
      tx ON (txout.txid = tx.txid)
    LEFT OUTER JOIN 
      txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
    WHERE
    txoutgroup.groupname = $1 AND
    ${params.unspent ? 'AND txin.prevtxid IS NULL' : ''}
    tx.txid = txout.txid
    AND tx.orphaned IS NOT TRUE
    OFFSET $2
    LIMIT $3`;

    result = await client.query(q, [ params.groupname, params.offset, params.limit ]);
    return result.rows;
  }

  public async getUtxoBalanceByScriptHashes(accountContext: IAccountContext, scripthashes: string[]): Promise<any> {
    const client = await this.db.getClient(accountContext);
    let result: any;
    const str = `
      SELECT * FROM
      (
        SELECT sum(satoshis) as balance
        FROM 
          txout 
        JOIN 
          tx ON (txout.txid = tx.txid)
        LEFT OUTER JOIN 
          txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
        WHERE
        txout.scripthash IN (${this.joinQuote(scripthashes)}) AND
        txin.prevtxid IS NULL AND
        tx.completed IS TRUE AND
        tx.orphaned IS NOT TRUE

        UNION

        SELECT sum(satoshis) as balance 
        FROM 
          txout  
        JOIN 
          tx ON (txout.txid = tx.txid)
        LEFT OUTER JOIN 
          txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
        WHERE
        txout.scripthash IN (${this.joinQuote(scripthashes)}) AND
        txin.prevtxid IS NULL AND
        tx.completed IS FALSE AND
        tx.orphaned IS NOT TRUE
      ) AS q1
    `;
    result = await client.query(str);
    let balance = {
      confirmed: result.rows[0].balance ? Number(result.rows[0].balance) : 0,
      unconfirmed: result.rows[1] && result.rows[1].balance ? Number(result.rows[1].balance) : 0,
    };
    return balance;
  }

  public async getUtxoBalanceByAddresses(accountContext: IAccountContext, addresses: string[]): Promise<any> {
    const client = await this.db.getClient(accountContext);
    let result: any;
    const str = `
      SELECT * FROM
      (
        SELECT sum(satoshis) as balance
        FROM 
          txout
        JOIN 
          tx ON (txout.txid = tx.txid)
        LEFT OUTER JOIN 
          txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
        WHERE
        txout.address IN (${this.joinQuote(addresses)}) AND
        txin.prevtxid IS NULL AND
        tx.completed IS TRUE AND
        tx.orphaned IS NOT TRUE

        UNION

        SELECT sum(satoshis) as balance
        FROM 
          txout  
        JOIN 
          tx ON (txout.txid = tx.txid)
        LEFT OUTER JOIN 
          txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
        WHERE
        txout.address IN (${this.joinQuote(addresses)}) AND
        txin.prevtxid IS NULL AND
        tx.completed IS FALSE AND
        tx.orphaned IS NOT TRUE
      ) AS q1
    `;
    result = await client.query(str);
    let balance = {
      confirmed: result.rows[0].balance ? Number(result.rows[0].balance) : 0,
      unconfirmed: result.rows[1] && result.rows[1].balance ? Number(result.rows[1].balance) : 0,
    };
    return balance;
  }

  /**
   * Todo: Refactor to not repeat queries
   */
  public async getUtxoBalanceByGroup(accountContext: IAccountContext, groupname: string): Promise<any> {
    const client = await this.db.getClient(accountContext);
    let result: any;
    const str = `
     SELECT * FROM
      (
        SELECT sum(satoshis) as balance
        FROM 
          txoutgroup
        JOIN
          txout ON (txoutgroup.scriptid = txout.address OR txoutgroup.scriptid = txout.scripthash)
        JOIN 
          tx ON (txout.txid = tx.txid)
        LEFT OUTER JOIN 
          txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
        WHERE
        txoutgroup.groupname = $1 AND
        txin.prevtxid IS NULL AND
        tx.completed IS TRUE AND
        tx.orphaned IS NOT TRUE

        UNION

        SELECT sum(satoshis) as balance
        FROM 
          txoutgroup
        JOIN
          txout ON (txoutgroup.scriptid = txout.address OR txoutgroup.scriptid = txout.scripthash)
        JOIN 
          tx ON (txout.txid = tx.txid)
        LEFT OUTER JOIN 
          txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
        WHERE
        txoutgroup.groupname = $1 AND
        txin.prevtxid IS NULL AND
        tx.completed IS FALSE AND
        tx.orphaned IS NOT TRUE
      ) AS q1
    `;
    result = await client.query(str, [ groupname, groupname ]);
    let balance = {
      confirmed: result.rows[0].balance ? Number(result.rows[0].balance) : 0,
      unconfirmed: result.rows[1] && result.rows[1].balance ? Number(result.rows[1].balance) : 0,
    }
    return balance;
  }

  public async getTxout(accountContext: IAccountContext, txid: string, index: number, script?: boolean): Promise<string> {
    const client = await this.db.getClient(accountContext);
    let result: any = await client.query(`
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis, tx.i, tx.h,
    txout.script, txin.txid as spend_txid, txin.index as spend_index
    FROM 
      txout 
    JOIN 
      tx ON (txout.txid = tx.txid)
    LEFT OUTER JOIN 
      txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
    WHERE
    txout.txid = $1 AND
    txout.index = $2 AND
    tx.orphaned IS NOT TRUE `, [
      txid, index
    ]);
    console.log('getxout', result.rows);
    return result.rows[0];
  }

  public async getTxoutsByOutpointArray(accountContext: IAccountContext, txOutpoints: Array<{ txid: string, index: string }>, script?: boolean): Promise<any[]> {
    const client = await this.db.getClient(accountContext);
    const txidToIndexMap = {};
    const txidsOnly = [];
    // tslint:disable-next-line: prefer-for-of
    for (let index = 0; index < txOutpoints.length; index++) {
      txidToIndexMap[txOutpoints[index].txid] = txidToIndexMap[txOutpoints[index].txid] || {};
      txidToIndexMap[txOutpoints[index].txid][txOutpoints[index].index] = true;
      txidsOnly.push(txOutpoints[index].txid);
    }
    let result = await client.query(`
    SELECT txout.txid, txout.index, txout.address, txout.scripthash, txout.satoshis, tx.i, tx.h,
    txout.script, txin.txid as spend_txid, txin.index as spend_index
    FROM 
      txout 
    JOIN 
      tx ON (txout.txid = tx.txid)
    LEFT OUTER JOIN 
      txin ON (txout.txid = txin.prevtxid AND txout.index = txin.previndex)
    WHERE
      txout.txid IN(${this.joinQuote(txidsOnly)}) AND tx.txid = txout.txid AND
      tx.orphaned IS NOT TRUE 
   `);
    const results = [];
    // Walk the results and only keep the txouts that match txid+index
    for (const row of result.rows) {
      if (txidToIndexMap[row.txid]) {
        if (txidToIndexMap[row.txid][row.index]) {
          results.push(row);
        }
      }
    }
    return results;
  }

  public async saveTxout(accountContext: IAccountContext, txid: string, index: number, address: string | null | undefined, scripthash: string, script: string, satoshis: number): Promise<string> {
    const client = await this.db.getClient(accountContext);
    let result: any = await client.query(
      `INSERT INTO txout(txid, index, address, scripthash, script, satoshis)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT DO NOTHING`, [
        txid, index, address, scripthash, script, satoshis
      ]);
    return result;
  }
 
  public async getTxHistoryByScriptHash(accountContext: IAccountContext, scripthashes: string [], params?: { order?: any, limit?: any, offset?: any, fromblockheight?: any}): Promise<any[]> {
    const client = await this.db.getClient(accountContext);
    if (!scripthashes || !scripthashes.length) {
      return [];
    }
 
    let order = 'desc NULLS FIRST';
    let orderSign = '<';
    if (params.order === 'asc') {
      order = 'asc NULLS LAST';
      orderSign = '>';
    }
    let limit = 1000;
    if (params.limit) {
      limit = parseInt(params.limit, 10);
    }

    if (isNaN(limit)) {
      throw new InvalidParamError();
    }
    if (limit > 1000) {
      throw new InvalidParamError();
    }

    if (limit < 100) {
      limit = 100;
    }

    let offset = 0;
    if (params.offset) {
      offset = parseInt(params.offset, 10);
    }
    if (offset < 0 || isNaN(offset)) {
      offset = 0;
    }
    let result = null;

    let fromblockheight = null;
    if (params.fromblockheight) {
      fromblockheight = parseInt(params.fromblockheight, 10);
    }

    if (fromblockheight) {
      const q = `
      SELECT tx.txid, rawtx, h, i, completed, 
      txout.index, txout.script, txout.address, txout.scripthash, 
      txout.satoshis 
      FROM tx, txout
      WHERE 
      tx.txid = txout.txid AND
      scripthash IN ($1) AND
      tx.orphaned IS NOT TRUE AND
      tx.i ${orderSign} ${fromblockheight} AND
      ORDER BY tx.i ${order}
      OFFSET $2
      LIMIT $3
      `;
      result = await client.query(q, [scripthashes]);
    } else {
      const q = `
      SELECT tx.txid, rawtx, h, i, completed, 
      txout.index, txout.script, txout.address, txout.scripthash, 
      txout.satoshis 
      FROM tx, txout
      WHERE 
      tx.txid = txout.txid AND
      scripthash IN ($1) AND
      tx.orphaned IS NOT TRUE AND
      ORDER BY tx.i ${order}
      OFFSET $2
      LIMIT $3
      `;
      result = await client.query(q);
    }
    return result.rows;
  }

  private joinQuote(arr: string[]): string {
    return "'" + arr.join("','") + "'";
  }

}

export default TxoutModel;
