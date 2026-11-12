import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadPaymentReceipt, validateReceiptFile, RECEIPT_MAX_BYTES } from "@/lib/mentorship-api";
const mock=vi.hoisted(()=>({rpc:vi.fn(),user:vi.fn(),from:vi.fn(),upload:vi.fn(),remove:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc:mock.rpc,auth:{getUser:mock.user},storage:{from:mock.from}}}));
const uid="00000000-0000-4000-8000-000000000002";
const iid="00000000-0000-4000-8000-000000000201";
function fixture(bytes:number[],size=bytes.length):File {return {name:"teste.pdf",size,slice:()=>({arrayBuffer:async()=>new Uint8Array(bytes).buffer})} as unknown as File;}
beforeEach(()=>{vi.resetAllMocks();mock.user.mockResolvedValue({data:{user:{id:uid}},error:null});mock.from.mockReturnValue({upload:mock.upload,remove:mock.remove});mock.upload.mockResolvedValue({error:null});mock.rpc.mockResolvedValue({data:"receipt",error:null});mock.remove.mockResolvedValue({error:null});vi.spyOn(crypto,"randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000999");});
afterEach(()=>vi.restoreAllMocks());
describe("Comprovantes privados",()=>{
 it.each([[0x25,0x50,0x44,0x46,0x2d],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],[0xff,0xd8,0xff]])("reconhece a assinatura real do arquivo %j",async(...bytes:number[])=>{expect(await validateReceiptFile(fixture(bytes))).toHaveProperty("mime");});
 it("rejeita HTML disfarçado de PDF",async()=>{await expect(validateReceiptFile(fixture([60,104,116,109,108,62]))).rejects.toThrow("válido");});
 it("limita tamanho antes de enviar",async()=>{await expect(uploadPaymentReceipt(uid,iid,fixture([1],RECEIPT_MAX_BYTES+1),"2026-11-12")).rejects.toThrow("10 MB");expect(mock.upload).not.toHaveBeenCalled();});
 it("rejeita arquivo vazio",async()=>{await expect(validateReceiptFile(fixture([],0))).rejects.toThrow();});
 it("usa bucket privado, caminho próprio e registro pendente via RPC",async()=>{const file=fixture([0x25,0x50,0x44,0x46,0x2d]);await uploadPaymentReceipt(uid,iid,file,"2026-11-12");expect(mock.from).toHaveBeenCalledWith("payment-receipts");expect(mock.upload).toHaveBeenCalledWith(`${uid}/${iid}/00000000-0000-4000-8000-000000000999.pdf`,file,{contentType:"application/pdf",upsert:false});expect(mock.rpc).toHaveBeenCalledWith("mentorship_register_receipt",expect.objectContaining({p_installment_id:iid,p_paid_on:"2026-11-12"}));expect(mock.remove).not.toHaveBeenCalled();});
 it("não envia arquivo com outra identidade",async()=>{mock.user.mockResolvedValue({data:{user:{id:"other"}},error:null});await expect(uploadPaymentReceipt(uid,iid,fixture([0x25,0x50,0x44,0x46,0x2d]),"2026-11-12")).rejects.toThrow("sessão");expect(mock.upload).not.toHaveBeenCalled();});
 it("erro de storage não cria registro de comprovante",async()=>{mock.upload.mockResolvedValue({error:{message:"upload denied"}});await expect(uploadPaymentReceipt(uid,iid,fixture([0x25,0x50,0x44,0x46,0x2d]),"2026-11-12")).rejects.toThrow("upload denied");expect(mock.rpc).not.toHaveBeenCalled();});
 it("limpa somente upload sem registro em caso de falha",async()=>{mock.rpc.mockResolvedValue({data:null,error:{message:"Parcela já quitada."}});await expect(uploadPaymentReceipt(uid,iid,fixture([0x25,0x50,0x44,0x46,0x2d]),"2026-11-12")).rejects.toThrow("quitada");expect(mock.remove).toHaveBeenCalledWith([`${uid}/${iid}/00000000-0000-4000-8000-000000000999.pdf`]);});
});
