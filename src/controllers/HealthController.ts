import { FastifyInstance, FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import EUserRole from "../enumerations/EUserRole";

const vacuum_database = (request: FastifyRequest, reply: FastifyReply, server: FastifyInstance): void => {
    if ((request.claims?.role ?? 0) < EUserRole.ADMINISTRATOR) {
        reply.code(403);
        return;
    }

    server.database.prepare("VACUUM;").run();
    reply.send(200);
};

const HealthController: FastifyPluginCallback = (fastify: FastifyInstance, _, done: (err?: Error | undefined) => void) => {

    const schemaCommon = { // For swagger categorization
        tags: ["Health"],
    };

    fastify.get("/vacuum", {
        schema: {
            response: {
                200: {
                    type: 'null',
                    description: 'No Content'
                },
                204: {
                    type: 'null',
                    description: 'No Content'
                },
                401: {
                    type: 'null',
                    description: 'Unauthorized'
                },
                403: {
                    type: 'null',
                    description: 'Unauthorized'
                }
            },
            ...schemaCommon
        }
    }, (request: FastifyRequest, reply: FastifyReply) => vacuum_database(request, reply, fastify));

    done();
};

export {
    HealthController
};
