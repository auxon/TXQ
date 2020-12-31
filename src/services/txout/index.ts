import { IAccountContext } from '@interfaces/IAccountContext';
import { Service, Inject } from 'typedi';
import ResourceNotFoundError from '../error/ResourceNotFoundError';

@Service('txoutService')
export default class TxoutService {
  constructor(@Inject('txoutModel') private txoutModel, @Inject('logger') private logger) {}

  public async getUnspentTxidsByScriptHash(accountContext: IAccountContext, scripthash: string[]) {
    let entity = await this.txoutModel.getUnspentTxidsByScriptHash(accountContext, scripthash);
    if (!entity) {
      throw new ResourceNotFoundError();
    }
    return entity;
  } 

  public async getTxoutByScriptHash(accountContext: IAccountContext, scripthash: string, offset: number, limit: number, script?: boolean, unspent?: boolean, order?: any) {
    let entity = await this.txoutModel.getTxoutByScriptHash(accountContext, scripthash, offset, limit, script, unspent, order);
    if (!entity) {
      throw new ResourceNotFoundError();
    }
    return entity;
  } 

  public async getTxoutCountByScriptHashOrAddress(accountContext: IAccountContext, scripthash: string[], unspent?: boolean) {
    let entity = await this.txoutModel.getTxoutCountByScriptHashOrAddress(accountContext, scripthash, unspent);
    if (!entity) {
      throw new ResourceNotFoundError();
    }
    return entity;
  }

  public async getTxoutByAddress(accountContext: IAccountContext, address: string, offset: number, limit: number, script?: boolean, unspent?: boolean, order?: string) {
    let entity = await this.txoutModel.getTxoutByAddress(accountContext, address, offset, limit, script, unspent, order);
    if (!entity) {
      throw new ResourceNotFoundError();
    }
    return entity;
  }

  public async getTxoutsByGroup(accountContext: IAccountContext, params: { groupname: string, script?: boolean, limit: any, offset: any, unspent?: boolean, order?: string}) {
    return this.txoutModel.getTxoutsByGroup(accountContext, params);
  }

  public async getTxoutCountByGroup(accountContext: IAccountContext, params: { groupname: string, unspent?: boolean}) {
    return this.txoutModel.getTxoutCountByGroup(accountContext, params);
  }

  public async getBalanceByAddresses(accountContext: IAccountContext, addresses: string[]) {
    return this.txoutModel.getUtxoBalanceByAddresses(accountContext, addresses);
  }

  public async getBalanceByScriptHashes(accountContext: IAccountContext, scripthashes: string[]) {
    return this.txoutModel.getUtxoBalanceByScriptHashes(accountContext, scripthashes);
  }

  public async getUtxoBalanceByGroup(accountContext: IAccountContext, groupname: string) {
    return this.txoutModel.getUtxoBalanceByGroup(accountContext, groupname);
  }

  public async getTxout(accountContext: IAccountContext, txid: string, index: number, script?: boolean) {
    let entity = await this.txoutModel.getTxout(accountContext, txid, index, script);
    if (!entity) {
      throw new ResourceNotFoundError();
    }
    return entity;
  }

  public async getTxoutsByOutpointArray(accountContext: IAccountContext, txOutpoints: {txid:  string, index: string}, script?: boolean) {
    return this.txoutModel.getTxoutsByOutpointArray(accountContext, txOutpoints, script);
  }

  public async saveTxout(accountContext: IAccountContext, txid: string, index: number, address: string | null | undefined, scripthash: string, script: string, satoshis: number) {
    await this.txoutModel.saveTxout(accountContext,
      txid, index, address, scripthash, script, satoshis
    );
  }

  public async getTxHistoryByScriptHash(scripthashes: string [], params: any): Promise<any[]> {
    return this.txoutModel.getTxHistoryByScriptHash(scripthashes, params);
  }

}



