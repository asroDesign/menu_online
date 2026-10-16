import { db } from "@/db";
import { testimonials } from "@/db/schema";
import { errorResponse, HttpError, readJson } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
const clean=(v:unknown,n:number)=>typeof v==="string"?v.trim().slice(0,n):"";
export async function POST(req:Request){try{await enforceRateLimit(req,"public-testimonial","website",5,60*60_000);const b=await readJson(req);const name=clean(b.name,100),businessName=clean(b.businessName,120),body=clean(b.body,1500),rating=Math.round(Number(b.rating));if(name.length<2||body.length<10||rating<1||rating>5)throw new HttpError(400,"نام، نظر حداقل ۱۰ نویسه‌ای و امتیاز ۱ تا ۵ وارد کنید");const [item]=await db.insert(testimonials).values({name,businessName,body,rating,isPublished:false}).returning({id:testimonials.id});return Response.json({item},{status:201});}catch(e){return errorResponse(e)}}
